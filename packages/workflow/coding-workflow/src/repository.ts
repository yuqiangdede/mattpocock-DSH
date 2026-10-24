/**
 * Repository effects of one coding-workflow task: read-only snapshots used by
 * every transition, evidence hashing, verification commands, and the single
 * local commit. No command here fetches, pushes, or writes a remote.
 *
 * @module @deepseek-ai/dsh-coding-workflow/repository
 */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'
import { WorkflowError } from './domain.ts'
import type { EvidenceRef, RepositorySnapshot } from './types.ts'

/** Evidence files above this size are refused instead of copied. */
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024
/** Process output retained per verification run. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
/** Default deadline for one Git command. */
const GIT_TIMEOUT_MS = 120_000

/** Executables a verification gate must never use. */
const FORBIDDEN_EXECUTABLE = /^(?:git|svn|ssh|scp|curl|wget)(?:[.]exe)?$/i

/** Shell metacharacters refused inside arguments of a shell-wrapped command. */
const SHELL_METACHARACTER = /[&|<>^%!"\r\n]/u

/** Outcome of one spawned command. */
export interface CommandResult {
  /** Exit code, or null when the process could not be started. */
  readonly exitCode: number | null
  /** Captured standard output, bounded. */
  readonly stdout: string
  /** Captured standard error, bounded. */
  readonly stderr: string
  /** Spawn failure message, empty when the process ran. */
  readonly error: string
}

/** Options one verification run accepts. */
export interface RunOptions {
  /** Caller cancellation. */
  readonly signal?: AbortSignal
  /** Deadline after which the child is killed. */
  readonly timeoutMs?: number
}

/** Repository operations the workflow service depends on. */
export interface RepositoryRunner {
  /**
   * Run one Git command and return its standard output.
   * @param root - repository root.
   * @param args - Git arguments.
   * @returns trimmed standard output.
   * @throws {WorkflowError} when Git exits non-zero or cannot start.
   */
  git(root: string, args: readonly string[]): Promise<string>

}

/** Spawn a child process and capture bounded output. */
function spawnCaptured(
  root: string,
  command: readonly string[],
  shell: boolean,
  timeout: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  const [executable, ...args] = command
  return new Promise((resolvePromise) => {
    if (executable === undefined) {
      resolvePromise({ exitCode: null, stdout: '', stderr: '', error: 'missing executable' })
      return
    }
    const child = spawn(executable, args, {
      cwd: root,
      shell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...signal === undefined ? {} : { signal },
    })
    let stdout = ''
    let stderr = ''
    const append = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
      const next = (target === 'stdout' ? stdout : stderr) + chunk.toString('utf8')
      if (next.length > MAX_OUTPUT_BYTES) {
        const capped = next.slice(0, MAX_OUTPUT_BYTES)
        if (target === 'stdout') stdout = capped
        else stderr = capped
        return
      }
      if (target === 'stdout') stdout = next
      else stderr = next
    }
    child.stdout.on('data', (chunk: Buffer) => { append('stdout', chunk) })
    child.stderr.on('data', (chunk: Buffer) => { append('stderr', chunk) })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.once('error', (error: Error) => {
      clearTimeout(timer)
      resolvePromise({ exitCode: null, stdout, stderr, error: error.message })
    })
    child.once('close', (code: number | null) => {
      clearTimeout(timer)
      resolvePromise({ exitCode: code, stdout, stderr, error: '' })
    })
  })
}

/** Runner backed by the Host's own Git and process facilities. */
export class LocalRepositoryRunner implements RepositoryRunner {
  async git(root: string, args: readonly string[]): Promise<string> {
    const result = await spawnCaptured(root, ['git', ...args], false, GIT_TIMEOUT_MS)
    if (result.exitCode !== 0) {
      throw new WorkflowError(
        (result.stderr || result.stdout || result.error || 'git command failed').slice(0, 1800),
        'WORKFLOW_GIT_FAILED',
      )
    }
    return result.stdout
  }

}

/**
 * SHA-256 of one buffer or string.
 * @param data - bytes or text to hash.
 * @returns the lowercase hexadecimal digest.
 */
export function digest(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Split NUL-separated Git path output. */
function nulSeparated(output: string): string[] {
  return output.split('\0').filter(Boolean)
}

/**
 * Read the branch, HEAD, and complete change set of one repository.
 * @param runner - repository operations.
 * @param root - repository root.
 * @returns the snapshot every transition validates against.
 */
export async function readSnapshot(runner: RepositoryRunner, root: string): Promise<RepositorySnapshot> {
  const branch = (await runner.git(root, ['branch', '--show-current'])).trim()
  const head = (await runner.git(root, ['rev-parse', 'HEAD'])).trim()
  const status = await runner.git(root, ['status', '--porcelain=v1', '-z'])
  const diff = await runner.git(root, ['diff', '--binary', 'HEAD'])
  const changed = nulSeparated(await runner.git(root, ['diff', '--name-only', '-z', 'HEAD']))
  const untracked = nulSeparated(await runner.git(root, ['ls-files', '--others', '--exclude-standard', '-z']))
  const files = [...new Set([...changed, ...untracked])].sort()
  const pieces: string[] = [status, diff]
  for (const file of files) {
    pieces.push(file)
    const full = resolve(root, file)
    if (!full.startsWith(root + sep)) throw new WorkflowError('Unsafe repository path', 'WORKFLOW_UNSAFE_PATH')
    pieces.push(existsSync(full) && statSync(full).isFile() ? digest(readFileSync(full)) : 'deleted-or-nonfile')
  }
  return { branch, head, clean: status.trim().length === 0, files, fingerprint: digest(pieces.join('\u0001')) }
}

/**
 * Hash one evidence file. Evidence may live outside the workspace (temporary
 * notes, captured output); only its digest enters the record, so a file
 * outside the repository can never enter the task commit.
 * @param root - repository root that resolves a relative evidence path.
 * @param file - absolute or workspace-relative evidence path.
 * @returns the canonical reference accepted into the record.
 */
export function readEvidence(root: string, file: string): EvidenceRef {
  const absolute = resolve(root, file)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new WorkflowError('Evidence file missing', 'WORKFLOW_EVIDENCE_INVALID')
  }
  if (statSync(absolute).size >= MAX_EVIDENCE_BYTES) throw new WorkflowError('Evidence exceeds limit', 'WORKFLOW_EVIDENCE_INVALID')
  return { path: absolute, sha256: digest(readFileSync(absolute)) }
}

/**
 * Verify that one recorded evidence file still holds the accepted content.
 * @param evidence - accepted reference.
 * @throws {WorkflowError} when the file vanished or changed.
 */
export function verifyEvidence(evidence: EvidenceRef): void {
  if (evidence.path.length === 0) return
  if (!existsSync(evidence.path) || !statSync(evidence.path).isFile()) {
    throw new WorkflowError('Stage evidence file is missing; rerun that stage', 'WORKFLOW_EVIDENCE_CHANGED')
  }
  if (digest(readFileSync(evidence.path)) !== evidence.sha256) {
    throw new WorkflowError('Stage evidence changed after verification', 'WORKFLOW_EVIDENCE_CHANGED')
  }
}

/**
 * Run one planned verification command without a shell.
 * @param runner - repository operations.
 * @param root - repository root.
 * @param command - exact executable and arguments.
 * @param timeoutMs - deadline for this run.
 * @param signal - caller cancellation.
 * @returns the observed outcome.
 */
export async function runVerification(
  execute: (root: string, command: readonly string[], options: RunOptions) => Promise<CommandResult>,
  root: string,
  command: readonly string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  const executable = command[0]
  if (executable === undefined) throw new WorkflowError('Missing verification command', 'WORKFLOW_INVALID_CHECKS')
  if (FORBIDDEN_EXECUTABLE.test(basename(executable))) {
    throw new WorkflowError('VCS/network command cannot be used as a verification gate', 'WORKFLOW_FORBIDDEN_COMMAND')
  }
  const windowsShell = process.platform === 'win32'
    && (/[.]cmd$|[.]bat$/i.test(executable) || /^(?:pnpm|npm|npx|yarn)$/i.test(executable))
  if (windowsShell && command.some(argument => SHELL_METACHARACTER.test(argument))) {
    throw new WorkflowError('Unsafe shell metacharacters in Windows build command', 'WORKFLOW_FORBIDDEN_COMMAND')
  }
  return execute(root, command, { timeoutMs, ...signal === undefined ? {} : { signal } })
}

/**
 * Create the task branch from the current HEAD.
 * @param runner - repository operations.
 * @param root - repository root.
 * @param branch - new branch name.
 */
export async function createBranch(runner: RepositoryRunner, root: string, branch: string): Promise<void> {
  await runner.git(root, ['switch', '-c', branch])
}

/**
 * Stage exactly the listed files and create one local commit.
 * @param runner - repository operations.
 * @param root - repository root.
 * @param files - exact repository-relative files to commit.
 * @param message - commit message.
 * @returns the new HEAD commit.
 * @throws {WorkflowError} when a foreign staged change exists, the staged
 *   scope differs, hooks change the tree, or the tree is dirty afterwards.
 */
export async function commitExactly(
  runner: RepositoryRunner,
  root: string,
  files: readonly string[],
  message: string,
): Promise<string> {
  if ((await runner.git(root, ['diff', '--cached', '--name-only'])).trim() !== '') {
    throw new WorkflowError('Foreign staged changes; refusing commit', 'WORKFLOW_FOREIGN_STAGED')
  }
  await runner.git(root, ['add', '--', ...files])
  const staged = nulSeparated(await runner.git(root, ['diff', '--cached', '--name-only', '-z'])).sort()
  if (JSON.stringify(staged) !== JSON.stringify([...files])) {
    throw new WorkflowError('Staged scope mismatch', 'WORKFLOW_STAGED_SCOPE')
  }
  const plannedTree = (await runner.git(root, ['write-tree'])).trim()
  await runner.git(root, ['commit', '-m', message])
  const head = (await runner.git(root, ['rev-parse', 'HEAD'])).trim()
  const committedTree = (await runner.git(root, ['rev-parse', 'HEAD^{tree}'])).trim()
  if (committedTree !== plannedTree) {
    throw new WorkflowError(`Commit hooks changed the staged tree; local commit exists and requires manual inspection: ${head}`,
      'WORKFLOW_COMMIT_HOOKS')
  }
  if ((await runner.git(root, ['status', '--porcelain'])).trim() !== '') {
    throw new WorkflowError(`Post-commit changes detected; local commit exists and requires manual inspection: ${head}`,
      'WORKFLOW_COMMIT_DIRTY')
  }
  return head
}

/**
 * Whether a branch name is one the workflow must never commit to directly.
 * @param branch - branch name to test.
 * @returns true for the protected trunk names.
 */
export function isProtectedBranch(branch: string): boolean {
  return branch === 'main' || branch === 'master'
}
