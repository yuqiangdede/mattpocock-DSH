import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const cli = resolve(import.meta.dirname, 'workflow-state.mjs')
// Windows keeps a directory handle open for a few seconds after the git
// children using it exit; `rmSync` reports EPERM without retrying that case.
const removeTree = path => {
  const deadline = Date.now() + 5000
  for (;;) {
    try { rmSync(path, { recursive: true, force: true }); return } catch (error) {
      if (Date.now() >= deadline) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
  }
}
const setup = () => {
  const base = mkdtempSync(join(tmpdir(), 'coding-workflow-'))
  const cwd = join(base, 'repo')
  const home = join(base, '.dsh')
  mkdirSync(cwd); mkdirSync(home)
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim()
  }
  git('init', '-b', 'master')
  git('config', 'user.name', 'Test User')
  git('config', 'user.email', 'test@example.invalid')
  writeFileSync(join(cwd, 'readme.txt'), 'base\n')
  git('add', 'readme.txt'); git('commit', '-m', 'baseline')
  const run = (...args) => {
    const r = spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...process.env, DSH_HOME: home }, encoding: 'utf8' })
    return { ...r, value: r.status === 0 ? JSON.parse(r.stdout) : null }
  }
  return { cwd, base, git, run, cleanup: () => removeTree(base) }
}
const configure = (e, id) => {
  const checks = join(e.base, 'checks.json')
  writeFileSync(checks, JSON.stringify({ allowedPaths: ['readme.txt'], checks: [
    { kind: 'test', command: [process.execPath, '--version'] },
    { kind: 'build', command: [process.execPath, '-p', '1+1'] },
  ] }))
  const result = e.run('checks', id, checks)
  assert.equal(result.status, 0, result.stderr)
}
test('a clean task defaults to manual and creates a local feature branch', () => {
  const e = setup()
  try {
    const created = e.run('start', 'simple change')
    assert.equal(created.status, 0, created.stderr)
    assert.equal(created.value.mode, 'manual')
    assert.match(created.value.branch, /^coding\//)
    assert.equal(e.run('mode', created.value.taskId, 'auto').value.status, 'paused')
    assert.equal(e.run('resume', created.value.taskId).value.status, 'ready')
  } finally { e.cleanup() }
})
test('dirty tree refuses task ownership without cleaning user edits', () => {
  const e = setup()
  try {
    writeFileSync(join(e.cwd, 'readme.txt'), 'user work\n')
    const r = e.run('start', 'never overwrite')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /dirty/)
    assert.equal(readFileSync(join(e.cwd,'readme.txt'),'utf8'), 'user work\n')
  } finally { e.cleanup() }
})
test('review/verification fingerprints guard local-only commit and stage order', () => {
  const e = setup()
  try {
    const id = e.run('start', 'add proof').value.taskId
    const ev = join(e.base, 'proof.txt'); writeFileSync(ev, 'evidence')
    for (const stage of ['S1','S2','S3']) assert.equal(e.run('stage',id,stage,ev).status, 0)
    configure(e, id)
    writeFileSync(join(e.cwd,'readme.txt'),'implemented\n')
    assert.equal(e.run('stage',id,'S4',ev).status, 0)
    const report = join(e.base,'review.json')
    writeFileSync(report, JSON.stringify({findings: []}))
    assert.equal(e.run('review',id,report).status, 0)
    assert.equal(e.run('commit',id,'--','readme.txt').status !== 0, true)
    assert.equal(e.run('verify',id,'test','--',process.execPath,'--version').status, 0)
    assert.notEqual(e.run('commit',id,'--','readme.txt').status, 0, 'build check required')
    assert.equal(e.run('verify',id,'build','--',process.execPath,'-p','1+1').status, 0)
    writeFileSync(join(e.cwd,'readme.txt'),'changed after verify\n')
    assert.notEqual(e.run('commit',id,'--','readme.txt').status, 0)
    writeFileSync(join(e.cwd,'readme.txt'),'implemented\n')
    const committed = e.run('commit',id,'--','readme.txt')
    assert.equal(committed.status,0,committed.stderr)
    assert.ok(committed.value.commitRef)
    assert.equal(e.git('rev-list','--count','HEAD'),'2')
    assert.notEqual(e.run('commit',id,'--','readme.txt').status,0)
  } finally { e.cleanup() }
})
test('a blocking review cannot masquerade as verified', () => {
  const e=setup()
  try {
    const id=e.run('start','review loop').value.taskId
    const ev=join(e.base,'proof.txt');writeFileSync(ev,'proof')
    for(const stage of ['S1','S2','S3']) assert.equal(e.run('stage',id,stage,ev).status,0)
    configure(e, id)
    writeFileSync(join(e.cwd,'readme.txt'),'changed\n')
    assert.equal(e.run('stage',id,'S4',ev).status,0)
    const report=join(e.base,'review.json')
    writeFileSync(report,JSON.stringify({findings:[{id:'1',severity:'P1',status:'open',file:'readme.txt',evidence:'unhandled case'}]}))
    assert.equal(e.run('review',id,report).value.currentStage,'S6')
    assert.notEqual(e.run('verify',id,'test','--',process.execPath,'--version').status,0)
    assert.notEqual(e.run('repair',id,ev).status,0)
  } finally {e.cleanup()}
})

test('active task owns its branch until cancellation or completion', () => {
  const e = setup()
  try {
    const one = e.run('start', 'first task')
    assert.equal(one.status, 0, one.stderr)
    const another = e.run('start', 'conflicting task')
    assert.notEqual(another.status, 0)
    assert.match(another.stderr, /already owns this branch/)
    const cancelled = e.run('cancel', one.value.taskId, 'user cancelled task')
    assert.equal(cancelled.value.status, 'cancelled')
    assert.equal(e.run('start', 'subsequent task').status, 0)
  } finally { e.cleanup() }
})

test('manual takeover and approval are explicit, stopped work cannot write checkpoints', () => {
  const e = setup()
  try {
    const id = e.run('start', 'approval handling').value.taskId
    const proof = join(e.base, 'requirements.txt'); writeFileSync(proof, 'reviewed requirements')
    assert.equal(e.run('mode', id, 'auto').value.status, 'paused')
    assert.notEqual(e.run('stage', id, 'S1', proof).status, 0)
    assert.equal(e.run('resume', id).value.status, 'ready')
    assert.equal(e.run('approval', id, 'Need explicit permission to change access control').value.status, 'waiting_approval')
    assert.notEqual(e.run('resume', id).status, 0)
    assert.notEqual(e.run('stage', id, 'S1', proof).status, 0)
    assert.equal(e.run('approve', id, 'approved scoped user role change').value.status, 'ready')
    assert.equal(e.run('stage', id, 'S1', proof).status, 0)
    assert.equal(e.run('mode', id, 'manual').value.status, 'paused')
    assert.notEqual(e.run('stage', id, 'S2', proof).status, 0)
  } finally { e.cleanup() }
})

test('out-of-scope files block implementation and do not get staged or deleted', () => {
  const e = setup()
  try {
    const id = e.run('start', 'bounded change').value.taskId
    const proof = join(e.base, 'proof.txt'); writeFileSync(proof, 'verified')
    for (const stage of ['S1', 'S2', 'S3'])
      assert.equal(e.run('stage', id, stage, proof).status, 0)
    configure(e, id) // Allows only readme.txt
    writeFileSync(join(e.cwd, 'readme.txt'), 'changed in scope\n')
    writeFileSync(join(e.cwd, 'unrelated.txt'), 'outside scope\n')
    const blocked = e.run('stage', id, 'S4', proof)
    assert.notEqual(blocked.status, 0)
    assert.match(blocked.stderr, /allowed task paths/)
    assert.equal(readFileSync(join(e.cwd, 'unrelated.txt'), 'utf8'), 'outside scope\n')
    assert.equal(e.git('diff', '--cached', '--name-only'), '')
    assert.notEqual(e.run('commit', id, '--', 'readme.txt', 'unrelated.txt').status, 0)
  } finally { e.cleanup() }
})

test('wrong branch invalidates a task without moving user HEAD', () => {
  const e = setup()
  try {
    const id = e.run('start', 'branch protection').value.taskId
    e.git('switch', '-c', 'different-branch')
    const proof = join(e.base, 'spec.txt'); writeFileSync(proof, 'requirements')
    const result = e.run('stage', id, 'S1', proof)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Branch changed/)
    assert.equal(e.git('branch', '--show-current'), 'different-branch')
  } finally { e.cleanup() }
})

test('repair evidence survives a clean rereview and permits fresh verification', () => {
  const e = setup()
  try {
    const id = e.run('start', 'repair with history').value.taskId
    const proof = join(e.base, 'proof.txt'); writeFileSync(proof, 'stage evidence')
    for (const stage of ['S1', 'S2', 'S3'])
      assert.equal(e.run('stage', id, stage, proof).status, 0)
    configure(e, id)
    writeFileSync(join(e.cwd, 'readme.txt'), 'buggy implementation\n')
    assert.equal(e.run('stage', id, 'S4', proof).status, 0)
    const review = join(e.base, 'review.json')
    writeFileSync(review, JSON.stringify({ findings: [{
      id: 'P1-1', severity: 'P1', status: 'open', file: 'readme.txt', evidence: 'incorrect behavior',
    }] }))
    assert.equal(e.run('review', id, review).value.currentStage, 'S6')
    writeFileSync(join(e.cwd, 'readme.txt'), 'repaired implementation\n')
    const repair = e.run('repair', id, proof)
    assert.equal(repair.status, 0, repair.stderr)
    assert.equal(repair.value.stages.S6.status, 'completed')
    writeFileSync(review, JSON.stringify({ findings: [] }))
    const clean = e.run('review', id, review)
    assert.equal(clean.status, 0, clean.stderr)
    assert.equal(clean.value.currentStage, 'S7')
    assert.equal(clean.value.stages.S6.status, 'completed')
    assert.equal(e.run('verify',id,'test','--',process.execPath,'--version').status, 0)
    assert.equal(e.run('verify',id,'build','--',process.execPath,'-p','1+1').status, 0)
    const committed = e.run('commit', id, '--', 'readme.txt')
    assert.equal(committed.status, 0, committed.stderr)
    assert.ok(committed.value.commitRef)
  } finally { e.cleanup() }
})
