#!/usr/bin/env node
/**
 * Fork-owned coding workflow checkpoint & local Git commit guard.
 * No dependencies other than Node >= 22 and Git. No push, fetch or remote writes.
 * Invocation: node workflow-state.mjs <command> [arguments]
 */
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const steps = ['S0','S1','S2','S3','S4','S5','S6','S7','S8','S9']
const home = path.resolve(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'))
const sha = data => createHash('sha256').update(data).digest('hex')
const ensure = (condition, reason) => { if (!condition) throw new Error(reason) }
const exec = (cwd, executable, args, opts = {}) => {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: opts.timeout || 120000, shell: opts.shell || false })
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || 'command failed').slice(0, 1800))
  return result.stdout
}
const git = (cwd, ...args) => exec(cwd, 'git', args)
const repository = () => fs.realpathSync(git(process.cwd(), 'rev-parse', '--show-toplevel').trim())
const storage = root => path.join(home, 'coding-work-items', sha(root).slice(0, 24))
const identifier = value => {
  ensure(/^[0-9a-f-]{36}$/.test(value || ''), 'Invalid task ID')
  return value
}
const taskPath = (root, id) => path.join(storage(root), identifier(id) + '.json')
const load = (root, id) => {
  const file = taskPath(root, id)
  const task = JSON.parse(fs.readFileSync(file, 'utf8'))
  ensure(task.repositoryRoot === root && task.schemaVersion === 1 && task.taskId === id, 'Task scope or schema mismatch')
  return task
}
const save = (root, task) => {
  const file = taskPath(root, task.taskId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.' + process.pid + '.' + randomUUID() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(task, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  fs.renameSync(tmp, file)
}
const mutate = (root, id, operation) => {
  const lock = taskPath(root, id) + '.lock'
  fs.mkdirSync(path.dirname(lock), { recursive: true })
  const handle = fs.openSync(lock, 'wx', 0o600)
  try {
    const task = load(root, id)
    const result = operation(task)
    task.revision++
    task.updatedAt = new Date().toISOString()
    save(root, task)
    return result ?? task
  } finally {
    fs.closeSync(handle)
    fs.unlinkSync(lock)
  }
}
const branch = root => git(root, 'branch', '--show-current').trim()
const head = root => git(root, 'rev-parse', 'HEAD').trim()
const changes = root => {
  const names = git(root, 'diff', '--name-only', '-z', 'HEAD').split('\0').filter(Boolean)
  const extra = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
  return [...new Set([...names, ...extra])].sort()
}
const snapshot = root => {
  const files = changes(root)
  const diff = git(root, 'diff', '--binary', 'HEAD')
  const pieces = [git(root, 'status', '--porcelain=v1', '-z'), diff]
  for (const name of files) {
    const full = path.resolve(root, name)
    ensure(full.startsWith(root + path.sep), 'Unsafe path')
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      const data = fs.readFileSync(full)
      pieces.push(name, sha(data))
    } else pieces.push(name, 'deleted-or-nonfile')
  }
  return { fingerprint: sha(pieces.join('\u0001')), files }
}
const scoped = (task, changeSet) => {
  ensure(Array.isArray(task.allowedPaths) && changeSet.files.every(f => task.allowedPaths.includes(f)),
    'Changes exceed explicitly allowed task paths')
}
const checkpoint = (root, task) => {
  ensure(task.repositoryRoot === root, 'Wrong workspace')
  ensure(branch(root) === task.branch, 'Branch changed')
  ensure(head(root) === (task.commitRef || task.baseCommit), 'HEAD changed outside workflow')
}
const evidence = file => {
  const absolute = path.resolve(file || '')
  ensure(file && fs.existsSync(absolute) && fs.statSync(absolute).isFile(), 'Evidence file missing')
  ensure(fs.statSync(absolute).size < 5 * 1024 * 1024, 'Evidence exceeds limit')
  return { path: absolute, sha256: sha(fs.readFileSync(absolute)) }
}
const completed = (task, name) => task.stages[name]?.status === 'completed'
const requirePrevious = (task, name) => {
  const index = steps.indexOf(name)
  ensure(index > 0, 'Unknown or reserved stage')
  for (const stage of steps.slice(0, index)) {
    if (stage === 'S6' && task.stages[stage].status === 'skipped') continue
    ensure(completed(task, stage), 'Prerequisite ' + stage + ' not completed')
  }
}
const invalidate = (task, stage) => {
  const index = steps.indexOf(stage)
  for (const id of steps.slice(index + 1)) {
    if (task.stages[id].status !== 'pending') task.stages[id] = { status: 'stale', attempts: task.stages[id].attempts }
  }
  if (index <= 3) { task.checks = null; task.allowedPaths = null; task.checksEvidence = null }
  if (index <= 4) { task.review = null; task.verification = null }
  if (index <= 6) { task.verification = null; task.verificationRuns = [] }
}
const output = value => console.log(JSON.stringify(value, null, 2))
const args = process.argv.slice(2)
const verb = args.shift()
const root = repository()
const start = () => {
  ensure(git(root, 'status', '--porcelain').trim() === '', 'Working tree is dirty; cannot claim existing changes')
  const id = randomUUID()
  const title = args.join(' ').trim()
  ensure(title.length > 0 && title.length <= 1000, 'Missing or excessive task title')
  let currentBranch = branch(root)
  ensure(currentBranch.length > 0, 'Detached HEAD not supported')
  // Prevent two unfinished work items from silently claiming one existing branch.
  const store = storage(root)
  if (fs.existsSync(store)) for (const file of fs.readdirSync(store)) {
    if (!/^[0-9a-f-]{36}[.]json$/.test(file)) continue
    const prior = JSON.parse(fs.readFileSync(path.join(store, file), 'utf8'))
    if (prior.repositoryRoot === root && prior.branch === currentBranch &&
        !['completed', 'cancelled'].includes(prior.status)) {
      throw new Error('An unfinished Work Item already owns this branch: ' + prior.taskId)
    }
  }
  if (currentBranch === 'main' || currentBranch === 'master') {
    currentBranch = 'coding/' + id.slice(0, 8)
    git(root, 'switch', '-c', currentBranch)
  }
  const now = new Date().toISOString()
  const stages = Object.fromEntries(steps.map(s => [s, { status: s === 'S0' ? 'completed' : 'pending', attempts: s === 'S0' ? 1 : 0 }]))
  const task = {
    schemaVersion: 1, revision: 1, taskId: id, title, mode: 'manual',
    repositoryRoot: root, branch: currentBranch, baseCommit: head(root),
    status: 'ready', currentStage: 'S1', stages, repairRounds: 0,
    review: null, verification: null, verificationRuns: [], checks: null, allowedPaths: null, commitRef: null, blocker: null,
    noProgressRounds: 0, createdAt: now, updatedAt: now,
  }
  save(root, task)
  return task
}
const requireNonterminal = task => ensure(!['cancelled','completed'].includes(task.status), 'Task is terminal')
const requireWritable = task => {
  requireNonterminal(task)
  ensure(!['blocked','waiting_approval','paused'].includes(task.status), 'Task is stopped; explicit resume or approval required')
}
const main = () => {
  if (verb === 'start') return output(start())
  const id = identifier(args.shift())
  if (verb === 'show') return output(load(root, id))
  const result = mutate(root, id, task => {
    if (verb === 'mode') {
      const mode = args.shift()
      ensure(mode === 'manual' || mode === 'auto', 'Expected manual or auto')
      requireNonterminal(task)
      task.mode = mode
      task.status = 'paused' // Switching never implicitly resumes an agent.
      return task
    }
    if (verb === 'pause') {
      requireNonterminal(task); task.status = 'paused'; return task
    }
    if (verb === 'cancel') {
      requireNonterminal(task)
      const reason = args.join(' ').trim()
      ensure(reason.length >= 8, 'Give a reason for cancelling this Work Item')
      task.status = 'cancelled'
      task.blocker = { reason, stage: task.currentStage }
      return task
    }
    if (verb === 'resume') {
      requireNonterminal(task); checkpoint(root, task)
      ensure(task.status !== 'waiting_approval', 'Approval required')
      task.status = 'ready'; task.blocker = null; return task
    }
    if (verb === 'block' || verb === 'approval') {
      requireNonterminal(task)
      const reason = args.join(' ').trim()
      ensure(reason.length >= 10, 'Give a concrete reason and proposed recovery')
      task.status = verb === 'approval' ? 'waiting_approval' : 'blocked'
      task.blocker = { reason, stage: task.currentStage }
      return task
    }
    if (verb === 'approve') {
      requireNonterminal(task)
      ensure(task.status === 'waiting_approval', 'No pending approval')
      const decision = args.join(' ').trim()
      ensure(decision.length >= 8, 'Missing scoped decision')
      task.approval = { decision, approvedAt: new Date().toISOString(), stage: task.currentStage }
      task.blocker = null
      task.status = 'ready'
      return task
    }
    checkpoint(root, task)
    requireWritable(task)
    if (verb === 'stage') {
      const name = args.shift()
      const file = args.shift()
      ensure(['S1','S2','S3','S4','S9'].includes(name), 'Stage needs specialized review/verify/commit action')
      requirePrevious(task, name)
      const proof = evidence(file)
      if (task.stages[name].status === 'completed') invalidate(task, name)
      if (name === 'S4') {
        ensure(task.checks?.length >= 2, 'Test and build checks must be planned before implementation')
        scoped(task, snapshot(root))
        ensure(changes(root).length > 0, 'Implementation has no code changes')
      }
      if (name === 'S9') ensure(task.commitRef, 'No commit reference')
      task.stages[name] = { status: 'completed', attempts: task.stages[name].attempts + 1, evidence: proof }
      task.currentStage = steps[steps.indexOf(name) + 1] || name
      task.status = name === 'S9' ? 'completed' : 'ready'
      return task
    }
    if (verb === 'checks') {
      ensure(completed(task, 'S3') && !completed(task, 'S4'), 'Checks must be configured between plan and implementation')
      const proof = evidence(args.shift())
      const plan = JSON.parse(fs.readFileSync(proof.path, 'utf8'))
      ensure(Array.isArray(plan.checks), 'Expected checks JSON')
      const checks = plan.checks
      ensure(checks.length >= 2 && checks.length <= 12, 'Expected 2-12 test/build checks')
      const kinds = checks.map(c => c?.kind)
      ensure(kinds.includes('test') && kinds.includes('build'), 'Test and build checks are required')
      ensure(new Set(kinds).size === kinds.length, 'Each check kind must be unique')
      for (const check of checks) {
        ensure(['test','build','lint','typecheck','integration'].includes(check.kind), 'Invalid check kind')
        ensure(Array.isArray(check.command) && check.command.length > 0 &&
          check.command.length <= 32 && check.command.every(a => typeof a === 'string' && a.length >= 1 && a.length <= 500),
          'Invalid actual command')
      }
      const allowed = plan.allowedPaths
      ensure(Array.isArray(allowed) && allowed.length > 0 && allowed.length <= 500,
        'Implementation plan requires 1-500 exact allowedPaths')
      ensure(new Set(allowed).size === allowed.length && allowed.every(f =>
        typeof f === 'string' && f.length < 500 && f.length > 0 &&
        !f.includes('\\') && !path.posix.isAbsolute(f) && path.posix.normalize(f) === f &&
        f !== '.' && f !== '..' && !f.startsWith('../') && !f.includes('\0') &&
        !f.startsWith('.git/') && !f.startsWith('node_modules/')),
        'Unsafe or duplicate allowed file paths')
      task.allowedPaths = [...allowed].sort()
      task.checks = checks.map(c => ({ kind: c.kind, command: [...c.command] }))
      task.checksEvidence = proof
      task.verificationRuns = []
      return task
    }
    if (verb === 'review') {
      requirePrevious(task, 'S5')
      const proof = evidence(args.shift())
      const report = JSON.parse(fs.readFileSync(proof.path, 'utf8'))
      ensure(Array.isArray(report.findings), 'Review JSON must have findings array')
      for (const f of report.findings) {
        ensure(f && typeof f.id === 'string' && f.id.length > 0 &&
          ['P0','P1','P2','P3'].includes(f.severity) &&
          ['open','resolved','accepted'].includes(f.status) &&
          typeof f.file === 'string' && typeof f.evidence === 'string',
          'Invalid structured review finding')
      }
      const open = report.findings.filter(f => ['P0','P1'].includes(f.severity) && f.status !== 'resolved')
      const current = snapshot(root)
      scoped(task, current)
      const findingIds = open.map(f => f.id).sort()
      const prior = task.review
      const sameFindings = prior?.blockers > 0 && JSON.stringify(prior.findingIds) === JSON.stringify(findingIds)
      task.noProgressRounds = sameFindings ? (task.noProgressRounds || 0) + 1 : 0
      task.review = { ...proof, fingerprint: current.fingerprint, blockers: open.length, findingIds }
      if (task.noProgressRounds >= 2) {
        task.status = 'blocked'
        task.blocker = { reason: 'Review found the same unresolved blocking issues after two repair iterations', stage: 'S5' }
        task.stages.S5 = { status: 'blocked', attempts: task.stages.S5.attempts + 1, evidence: proof }
        return task
      }
      task.stages.S5 = { status: open.length ? 'failed' : 'completed', attempts: task.stages.S5.attempts + 1, evidence: proof }
      task.stages.S6 = open.length
        ? { status: 'pending', attempts: task.stages.S6.attempts }
        : task.repairRounds > 0 && task.stages.S6.status === 'completed'
          ? task.stages.S6
          : { status: 'skipped', attempts: task.stages.S6.attempts, reason: 'No blocking findings or repair needed' }
      task.stages.S7 = { status: 'stale', attempts: task.stages.S7.attempts }
      task.verificationRuns = []
      task.currentStage = open.length ? 'S6' : 'S7'
      task.status = 'ready'
      return task
    }
    if (verb === 'repair') {
      ensure(task.stages.S5.status === 'failed', 'No failed review requiring repair')
      const proof = evidence(args.shift())
      const current = snapshot(root)
      scoped(task, current)
      ensure(current.fingerprint !== task.review?.fingerprint, 'No diff changes; repair made no progress')
      task.repairRounds++
      ensure(task.repairRounds <= 3, 'Automatic repair limit reached')
      task.stages.S6 = { status: 'completed', attempts: task.repairRounds, evidence: proof }
      task.stages.S5 = { status: 'pending', attempts: task.stages.S5.attempts }
      task.stages.S7 = { status: 'stale', attempts: task.stages.S7.attempts }
      task.currentStage = 'S5'
      task.verification = null
      task.verificationRuns = []
      task.status = 'ready'
      return task
    }
    if (verb === 'verify') {
      requirePrevious(task, 'S7')
      ensure(task.review?.blockers === 0, 'Unresolved blocking review findings')
      const current = snapshot(root)
      scoped(task, current)
      ensure(task.review.fingerprint === current.fingerprint, 'Source changed after review')
      const kind = args.shift()
      ensure(args[0] === '--', 'Usage: verify <task> <check-kind> -- <command> [args]')
      args.shift()
      const executable = args.shift()
      const command = [executable, ...args]
      const planned = task.checks?.find(c => c.kind === kind)
      ensure(planned && JSON.stringify(planned.command) === JSON.stringify(command), 'Command is not part of the approved implementation plan')
      // Windows .cmd/.bat needs a command interpreter, but never allow its metacharacters
      // in the executable or arguments. Native executables must not enter a shell.
      const needsShell = process.platform === 'win32' &&
        (/[.]cmd$|[.]bat$/i.test(executable) || /^(?:pnpm|npm|npx|yarn)$/i.test(executable))
      ensure(!needsShell || command.every(value => !/[&|<>^%!"\r\n]/u.test(value)),
        'Unsafe shell metacharacters in Windows build command')
      ensure(!/^(?:git|svn|ssh|scp|curl|wget)(?:[.]exe)?$/i.test(path.basename(executable)),
        'VCS/network command cannot be used as a verification gate')
      const result = spawnSync(executable, args, {
        cwd: root, encoding: 'utf8', shell: needsShell,
        timeout: 30 * 60 * 1000, maxBuffer: 16 * 1024 * 1024,
      })
      const changed = snapshot(root)
      const passed = !result.error && result.status === 0 && changed.fingerprint === current.fingerprint
      const run = {
        kind, command, exitCode: result.status, passed,
        fingerprint: current.fingerprint, logSha256: sha((result.stdout || '') + (result.stderr || '')),
        error: String(result.error?.message || ''), ranAt: new Date().toISOString(),
      }
      task.verificationRuns = [...(task.verificationRuns || []).filter(c => c.kind !== kind), run]
      const allPassed = task.checks.every(c => task.verificationRuns.some(r =>
        r.kind === c.kind && r.passed && r.fingerprint === current.fingerprint))
      task.verification = allPassed ? { passed: true, fingerprint: current.fingerprint, runs: task.verificationRuns } : null
      task.stages.S7 = { status: !passed ? 'failed' : allPassed ? 'completed' : 'pending',
        attempts: task.stages.S7.attempts + 1, evidence: run }
      task.currentStage = allPassed ? 'S8' : 'S7'
      task.status = passed ? 'ready' : 'blocked'
      if (!passed) task.blocker = { reason: 'Verification failed or changed source; inspect actual command and rerun', stage: 'S7' }
      return task
    }
    if (verb === 'commit') {
      requirePrevious(task, 'S8')
      const current = snapshot(root)
      scoped(task, current)
      ensure(task.review?.fingerprint === current.fingerprint, 'Review is stale')
      ensure(task.verification?.passed && task.verification.fingerprint === current.fingerprint, 'Verification is stale')
      ensure(task.checks.every(c => task.verificationRuns.some(r => r.kind === c.kind &&
        r.passed && r.fingerprint === current.fingerprint)), 'Missing test/build evidence')
      const allEvidence = ['S1','S2','S3','S4','S5']
        .map(name => task.stages[name].evidence).filter(Boolean)
      for (const proof of allEvidence) {
        ensure(evidence(proof.path).sha256 === proof.sha256, 'Stage evidence changed after verification')
      }
      ensure(task.checksEvidence && evidence(task.checksEvidence.path).sha256 === task.checksEvidence.sha256,
        'Planned checks changed after verification')
      ensure(task.branch !== 'main' && task.branch !== 'master', 'Commit on main/master disallowed')
      ensure(git(root, 'diff', '--cached', '--name-only').trim() === '', 'Foreign staged changes; refusing commit')
      ensure(args[0] === '--', 'Usage: commit <task> -- <exact file paths>')
      args.shift()
      const listed = [...new Set(args)].sort()
      ensure(listed.length > 0 && listed.every(f => f && !path.isAbsolute(f) && f !== '..' && !f.startsWith('../') && !f.includes('\0')), 'Unsafe commit file list')
      ensure(JSON.stringify(listed) === JSON.stringify(current.files), 'Unowned files or incomplete file list')
      ensure(listed.every(f => !/(^|\/)(\.env(?:\..+)?|id_rsa|.*\.(?:pem|key)|credentials(?:\..+)?)$/i.test(f.replaceAll('\\','/'))), 'Sensitive candidate file')
      git(root, 'add', '--', ...listed)
      const staged = git(root, 'diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean).sort()
      ensure(JSON.stringify(staged) === JSON.stringify(listed), 'Staged scope mismatch')
      const plannedTree = git(root, 'write-tree').trim()
      const message = 'feat: ' + task.title.slice(0, 65) + ' (' + task.taskId.slice(0,8) + ')'
      git(root, 'commit', '-m', message)
      const committedHead = head(root)
      const committedTree = git(root, 'rev-parse', 'HEAD^{tree}').trim()
      ensure(committedTree === plannedTree, 'Commit hooks changed the staged tree; local commit exists and requires manual inspection: ' + committedHead)
      ensure(git(root, 'status', '--porcelain').trim() === '', 'Post-commit changes detected; local commit exists and requires manual inspection: ' + committedHead)
      task.commitRef = committedHead
      task.stages.S8 = { status: 'completed', attempts: task.stages.S8.attempts + 1, evidence: { commit: task.commitRef, files: listed } }
      task.currentStage = 'S9'
      task.status = 'ready'
      return task
    }
    throw new Error('Unknown command')
  })
  output(result)
}
try { main() } catch (error) {
  console.error('CODING_WORKFLOW_BLOCKED:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
