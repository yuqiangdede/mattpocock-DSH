import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const cli = resolve(import.meta.dirname, 'workflow-state.mjs')
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
  return { cwd, base, git, run, cleanup: () => rmSync(base, { recursive: true, force: true }) }
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
