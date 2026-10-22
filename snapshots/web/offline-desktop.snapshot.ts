/** Recorded-session replay of the Windows bundles through the shipped dsh Web profile. */
import { spawn, execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import {
  fixtureContext, formatSystemPromptSnapshot, formatToolSchemasSnapshot, latestPersistedSessionPaths,
  normalizeSessionLog, normalizedSystemPrompts, normalizedToolSchemas, redactSessionSnapshotIds, scrubSessionSnapshot,
} from '@deepseek-ai/dsh-session-snapshot'
import { stageDesktopOperatorTarball, writeDesktopOperatorPresetBundle } from '../../apps/desktop/scripts/bundled-desktop-operator.ts'
import { stageBundledLlmRetryTarball } from '../../apps/desktop/scripts/bundled-llm-retry.ts'
import { stageBundledSideChatTarball } from '../../apps/desktop/scripts/bundled-side-chat.ts'
import { createPluginProfile } from '../../apps/desktop/src/project-manager.ts'
import { BUNDLED_SIDE_CHAT, BUNDLED_DESKTOP_OPERATOR, BUNDLED_LLM_RETRY } from '../../apps/desktop/src/bundled-plugins.ts'
import { fixtureUserPrompts, normalizeWebSessionVolatiles } from '../../apps/web/tests/scaffold.ts'
import { parseSessionLog } from '@deepseek-ai/dsh-llm-replay'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const directory = fileURLToPath(new URL('./', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'
const scenarios = ['computer-use', 'side-chat', 'llm-retry'] as const
let root: string
let runtime: string

describe.skipIf(process.platform !== 'win32')('Windows offline bundle recorded Sessions', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-desktop-recordings-'))
    runtime = join(root, 'runtime')
    const downloads = await Promise.allSettled([
      stageDesktopOperatorTarball(runtime, join(root, 'cache')),
      stageBundledLlmRetryTarball(runtime, join(root, 'cache')),
      stageBundledSideChatTarball(runtime, join(root, 'cache')),
    ])
    const failures = downloads.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (failures.length > 0) throw new AggregateError(failures, 'Bundled snapshot archives could not be verified')
    const modules = join(runtime, 'node_modules')
    await mkdir(join(modules, '@deepseek-ai/dsh-web-app/presets'), { recursive: true })
    await cp(join(repo, 'packages/bundle/web-app/presets/standard.patch.yml'), join(modules, '@deepseek-ai/dsh-web-app/presets/standard.patch.yml'))
    for (const release of [BUNDLED_DESKTOP_OPERATOR, BUNDLED_LLM_RETRY, BUNDLED_SIDE_CHAT]) {
      const destination = join(modules, release.name)
      await mkdir(destination, { recursive: true })
      await promisify(execFile)('tar', ['-xf', join(runtime, 'vendor', `${release.name}-${release.version}.tgz`), '--strip-components=1', '-C', destination])
      await mkdir(join(destination, 'node_modules'), { recursive: true })
      await symlink(join(repo, 'apps/cli/node_modules/@deepseek-ai'), join(destination, 'node_modules/@deepseek-ai'), 'junction')
      if (release.name === BUNDLED_SIDE_CHAT.name) {
        await symlink(join(repo, 'vendor/schemastery'), join(destination, 'node_modules/schemastery'), 'junction')
      }
    }
    writeDesktopOperatorPresetBundle(runtime)
    const controller = join(modules, 'desktop-recording-controller')
    await mkdir(join(controller, 'node_modules'), { recursive: true })
    await symlink(join(repo, 'apps/cli/node_modules/@deepseek-ai'), join(controller, 'node_modules/@deepseek-ai'), 'junction')
    await cp(join(repo, 'apps/desktop/tests/fixtures/recorded-bundles.mjs'), join(controller, 'index.mjs'))
    await writeFile(join(controller, 'package.json'), JSON.stringify({
      name: 'desktop-recording-controller', version: '1.0.0', type: 'module', exports: './index.mjs', dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(controller, 'cordis.patch.yml'), '- insert:\n    - id: desktop-recording-controller\n      name: desktop-recording-controller\n')
  }, 180_000)

  afterAll(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }) }, 30_000)

  it.each(scenarios)('%s replays model requests, stream events, and persisted Session output', async (scenario) => {
    const expectedDir = join(directory, `offline-desktop-${scenario}`)
    const fixture = join(expectedDir, 'session.v4.jsonl')
    const childFixture = join(expectedDir, 'session.1.v4.jsonl')
    const world = await mkdtemp(join(root, `${scenario}-`))
    const home = join(world, 'home')
    const profile = join(home, 'profiles/web')
    await createPluginProfile(profile)
    const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    const bundles = [...manifest.dsh.profile.bundles.filter(name => !name.startsWith('@deepseek-ai/')), BUNDLED_DESKTOP_OPERATOR.name, 'desktop-recording-controller']
    for (const name of bundles) {
      const source = join(runtime, 'node_modules', name)
      const link = join(profile, 'node_modules', name)
      await mkdir(dirname(link), { recursive: true })
      await symlink(source, link, 'junction')
      manifest.dependencies[name] = `file:${source}`
    }
    manifest.dsh.profile.bundles.push('desktop-recording-controller')
    await writeFile(join(profile, 'package.json'), JSON.stringify(manifest))
    const patch = [
      { id: 'desktop-recording-controller', config: { scenario, fixture, childFixture, cwd: world } },
      { id: 'session-persistence-jsonl', config: { root: join(home, 'sessions'), compression: 'none' } },
      { id: 'session-title-llm', disabled: true },
      { id: 'session-telemetry-otel', disabled: true },
      { id: 'llm-retry-settings', config: { enabled: scenario === 'llm-retry', maxRetries: 1,
        initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0, retryableCodes: ['DESKTOP_SNAPSHOT_RETRY'],
        autoContinue: false, logPath: join(world, 'retry.log') } },
    ]
    await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify(patch))
    const launch = resolveExampleLaunch({
      srcBin: join(repo, 'apps/cli/src/bin.ts'), mode: 'lib',
      configArgs: ['--profile', 'web', '--patch', join(repo, 'apps/web/tests/pin-browse-picker.overlay.yml'), '--no-open', '--host', '127.0.0.1', '--port', '0'],
      env: { DSH_HOME: home, DSH_AGENTS_HOME: join(world, 'agents'), DSH_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '' },
    })
    const child = spawn(launch.command, launch.args, { cwd: world, env: { ...process.env, ...launch.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    const deadline = AbortSignal.timeout(90_000)
    let output = ''
    const ready = Promise.withResolvers<string>()
    const exited = new Promise<void>((resolve) => {
      child.once('close', (code) => { ready.reject(new Error(`dsh exited ${String(code)}\n${output}`)); resolve() })
    })
    child.once('error', error => ready.reject(error))
    const receive = (bytes: Buffer) => {
      output += bytes.toString()
      const url = /dsh web: (http:\/\/[^\s]+)/u.exec(output)?.[1]
      if (url !== undefined) ready.resolve(url)
    }
    child.stdout.on('data', receive)
    child.stderr.on('data', receive)
    const timer = setTimeout(() => ready.reject(new Error(`dsh readiness timed out\n${output}`)), 45_000)
    let observed: unknown
    try {
      const url = await ready.promise
      clearTimeout(timer)
      const login = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([deadline, AbortSignal.timeout(30_000)]) })
      const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      const post = async (path: string, payload: object) => {
        const response = await fetch(new URL(path, url), { method: 'POST', headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.any([deadline, AbortSignal.timeout(45_000)]) })
        const text = await response.text()
        expect(response.status, text + '\n' + output).toBe(200)
        return JSON.parse(text) as Record<string, unknown>
      }
      const task = fixtureUserPrompts(await readFile(fixture, 'utf8'))[0]!
      const parent = await post('/desktop-snapshot/create', { task })
      let childId: string | undefined
      if (scenario === 'side-chat') {
        const content = sideChatInput(await readFile(childFixture, 'utf8'))
        const started = await post('/sidechat/api/sidechat.start', { parentSessionId: parent.sessionId,
          content })
        childId = (started.value as { childId: string }).childId
      }
      const settled = await post(`/desktop-snapshot/settle${childId === undefined ? '' : `?child=${encodeURIComponent(childId)}`}`, {})
      observed = settled.observed
      expect(JSON.stringify(settled)).toContain('turn/end')
      if (childId !== undefined) {
        const history = await post('/sidechat/api/sidechat.history', { childId })
        expect(JSON.stringify(history)).toContain('SIDE_CHAT_OK')
      }
    } finally {
      clearTimeout(timer)
      let forced = false
      const kill = setTimeout(() => { forced = true; child.kill('SIGKILL') }, 20_000)
      try {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
        await exited
      } finally { clearTimeout(kill) }
      expect(forced, output).toBe(false)
    }
    const paths = latestPersistedSessionPaths((await readdir(join(home, 'sessions'), { recursive: true }))
      .map(path => join(home, 'sessions', path)))
    const logs = await Promise.all(paths.map(path => readFile(path, 'utf8')))
    for (const raw of logs) parseSessionLog(raw)
    logs.sort((a, b) => Number(JSON.parse(a.split('\n')[0]!).parentSession !== undefined) - Number(JSON.parse(b.split('\n')[0]!).parentSession !== undefined))
    expect(logs).toHaveLength(scenario === 'side-chat' ? 2 : 1)
    let eventStream = JSON.stringify(observed, null, 2) + '\n'
    for (const [index, log] of logs.entries()) {
      const header = JSON.parse(log.split('\n')[0]!) as { id: string }
      eventStream = eventStream.replaceAll(JSON.stringify(header.id), JSON.stringify(`{{session:${index + 1}}}`))
    }
    await golden(join(expectedDir, 'events.expected.json'), eventStream)
    const texts = logs.join('\n')
    expect(texts).toContain('request/header')
    expect(texts).toContain('"kind":"completed"')
    if (scenario === 'computer-use') {
      expect(texts).toContain('mcp__computer_use__list_windows')
      expect(texts).toContain('"type":"tool/result"')
      expect(texts).toContain('"type":"tool/call"')
    }
    if (scenario === 'llm-retry') {
      expect(texts).toContain('DESKTOP_SNAPSHOT_RETRY')
      expect(texts).toContain('assistant/attempt')
      expect(texts).toContain('DESKTOP_SNAPSHOT_OK')
    }
    const normalized = logs.map(log => normalizeWebSessionVolatiles(log, world))
    const identities = redactSessionSnapshotIds(normalized)
    for (const [index, raw] of normalized.entries()) {
      const context = fixtureContext(raw)
      const stem = index === 0 ? 'session' : `session.${index}`
      const sidecar = index === 0 ? '' : `.${index}`
      await golden(join(expectedDir, `${stem}.v4.jsonl`), scrubSessionSnapshot(normalizeSessionLog(identities[index]!, context, { identityMode: 'preserve' })))
      const prompts = normalizedSystemPrompts(raw, context)
      const tools = normalizedToolSchemas(raw, context)
      expect(prompts.length).toBeGreaterThan(0)
      expect(tools.length).toBeGreaterThan(0)
      await golden(join(expectedDir, `system-prompt${sidecar}.expected.md`), formatSystemPromptSnapshot(prompts[0]!, prompts.slice(1)))
      await golden(join(expectedDir, `tool-schemas${sidecar}.expected.json`), formatToolSchemasSnapshot(tools[0]!, tools.slice(1)))
    }
  }, 120_000)
})

function sideChatInput(log: string) {
  const user = parseSessionLog(log).find(event => event.type === 'user/message' && event.data.source.kind === 'user')
  if (user?.type !== 'user/message') throw new Error('Side Chat fixture has no user message')
  expect(user.data.content.at(-1)).toEqual({ type: 'text', text: '[sidechat-guidance][请仅基于上述内容直接回答，不要主动查阅工作区文件或父会话记录。]' })
  return user.data.content.slice(0, -1)
}

async function golden(path: string, text: string): Promise<void> {
  if (refreshing) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text) }
  else expect(text, path).toBe(await readFile(path, 'utf8'))
}
