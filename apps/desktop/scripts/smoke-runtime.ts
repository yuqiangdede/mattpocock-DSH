/** Boot the materialized target runtime without access to a user's Harness profile. */

import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { readPrimaryRuntime, workspaceDependencyPaths } from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { runtimeArchivePath } from '../../desktop-host/src/office-engine.ts'
import { DesktopHostProcess } from '../src/host-process.ts'
import { createPluginProfile } from '../src/project-manager.ts'
import { BUNDLED_SIDE_CHAT, BUNDLED_LLM_RETRY, DESKTOP_OPERATOR_PRESET_BUNDLE, DESKTOP_OPERATOR_PRESET_ID } from '../src/bundled-plugins.ts'
import { loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import type { DesktopRuntimeDescriptor } from '../src/runtime-tree.ts'

/**
 * Check CLI package operations, Host startup, its frontend, external plugins and real Office-to-PDF conversion.
 * @param root - Materialized dsh resources.
 * @param node - Prepared target Electron executable.
 * @param runtime - Verified resource descriptor.
 * @param environment - Credential-scrubbed build environment and private native cache.
 * @param resourcesRuntime - Bundled interpreters outside the application archive.
 * @returns Resolves after checks and teardown; rejects on a check or teardown failure.
 */
export async function smokeDesktopRuntime(
  root: string, node: string, runtime: DesktopRuntimeDescriptor, environment: NodeJS.ProcessEnv, resourcesRuntime: string,
): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-smoke-'))
  const profile = join(home, 'profiles', 'desktop')
  const hostEnvironment = {
    ...Object.fromEntries(Object.entries(environment).filter(([name]) => !/^(?:npm|pnpm|corepack)_/iu.test(name))),
    DSH_HOME: home, HOME: home, USERPROFILE: home,
    XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, XDG_STATE_HOME: home,
    APPDATA: home, LOCALAPPDATA: home,
    npm_config_userconfig: join(home, 'npmrc'), npm_config_globalconfig: join(home, 'npmrc'),
    npm_config_store_dir: join(home, 'store'), npm_config_enable_global_virtual_store: 'false',
  }
  const host = new DesktopHostProcess(node, root, profile, undefined, hostEnvironment,
    undefined, join(resourcesRuntime, 'primary-runtime'),
    { pnpm: join(resourcesRuntime, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'), nodeBin: join(resourcesRuntime, 'bin') })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    writeFileSync(join(home, 'npmrc'), '')
    createPluginProfile(profile)
    // This process is plain Node, which reads no path inside the application ASAR.
    const archive = runtimeArchivePath(root)
    if (archive === undefined) {
      const loaded = loadProfileDirectory('dsh', profile,
        join(root, 'package.json'))
      if (loaded.skippedBundles.length !== 0
        || (process.platform === 'win32' && !loaded.layers.some(layer => layer.packageName === BUNDLED_SIDE_CHAT.name))) {
        throw new Error(`desktop side chat: bundle not resolved: ${JSON.stringify(loaded.skippedBundles)}`)
      }
      if (process.platform === 'win32') {
        if (!loaded.layers.some(layer => layer.packageName === BUNDLED_LLM_RETRY.name)) {
          throw new Error(`desktop LLM retry: offline settings bundle missing: ${JSON.stringify(loaded.skippedBundles)}`)
        }
        if (!loaded.layers.some(layer => layer.packageName === DESKTOP_OPERATOR_PRESET_BUNDLE)) {
          throw new Error(`desktop Computer Use: offline bundle missing: ${JSON.stringify(loaded.skippedBundles)}`)
        }
        const adapter = readFileSync(join(root, 'node_modules',
          ...DESKTOP_OPERATOR_PRESET_BUNDLE.split('/'), 'cordis.patch.yml'), 'utf8')
        if (!adapter.includes(`id: ${DESKTOP_OPERATOR_PRESET_ID}`)
          || !adapter.includes('name: \'dsh-desktop-operator\'')
          || !adapter.includes('highRiskActionPolicy: confirm')) {
          throw new Error('desktop Computer Use: offline Agent Preset not mounted')
        }
        console.log('desktop runtime: bundled Computer Use preset and native package passed')
      }
    } else {
      // The Host boot below resolves the same bundles through Electron, which reads the archive.
      console.log(`desktop runtime: packaged archive ${archive}; bundle resolution is checked by the Host boot`)
    }
    const pluginName = 'desktop-runtime-smoke-plugin'
    const plugin = join(home, pluginName)
    mkdirSync(plugin, { recursive: true })
    const installedName = 'desktop-installed-smoke-plugin'
    const installedPlugin = join(home, installedName)
    mkdirSync(installedPlugin)
    writeFileSync(join(installedPlugin, 'package.json'), JSON.stringify({
      name: installedName, version: '1.0.0', type: 'module', exports: './index.js', dsh: { bundle: { patch: './bundle.yml' } },
    }))
    writeFileSync(join(installedPlugin, 'index.js'), `
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-installed',
    handler(_request, response) { response.end('installed plugin ready') } }))
}
`)
    writeFileSync(join(installedPlugin, 'bundle.yml'), `- insert:\n    - id: ${installedName}\n      name: ${installedName}\n      inject: [webServer]\n`)
    appendFileSync(join(profile, 'pnpm-workspace.yaml'), 'offline: true\nupdateNotifier: false\n')
    const cli = join(root, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
    const runCli = (args: string[]) => promisify(execFile)(node,
      ['--expose-internals', cli, 'plugin', '--profile', 'desktop', ...args],
      { cwd: home, env: { ...hostEnvironment, ELECTRON_RUN_AS_NODE: '1' }, timeout: 120_000, windowsHide: true })
    await runCli(['add', `file:${installedPlugin}`, '--offline', '--ignore-scripts'])
    const installedEntry = join(profile, 'node_modules', installedName, 'index.js')
    if (readFileSync(installedEntry, 'utf8') !== readFileSync(join(installedPlugin, 'index.js'), 'utf8')) {
      throw new Error('desktop runtime: CLI did not install the local plugin')
    }
    await runCli(['remove', installedName])
    if (existsSync(installedEntry)) throw new Error('desktop runtime: CLI did not remove the local plugin')
    console.log('desktop runtime: CLI offline plugin installation and removal passed')
    const primary = join(resourcesRuntime, 'primary-runtime')
    const dependencies = workspaceDependencyPaths(primary, await readPrimaryRuntime(primary))
    await promisify(execFile)(dependencies.python, ['-I', '-B',
      fileURLToPath(new URL('../tests/fixtures/office-conversion-inputs.py', import.meta.url)), home],
    { env: environment, timeout: 120_000, windowsHide: true })
    const inputs = ['docx', 'xlsx', 'pptx'].map(extension => ({ extension,
      bytes: readFileSync(join(home, `input.${extension}`)).toString('base64') }))
    const cordis = runtime.sharedPackages.find(entry => entry.name === '@deepseek-ai/cordis')
    if (cordis === undefined) throw new Error('desktop runtime: missing shared Cordis package')
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({
      name: pluginName, version: '1.0.0', type: 'module', exports: './index.js',
      peerDependencies: { '@deepseek-ai/cordis': cordis.version }, dsh: { bundle: { patch: './bundle.yml' } },
    }))
    writeFileSync(join(plugin, 'index.js'), `
import { Context } from '@deepseek-ai/cordis'
import { inspect, promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
export function apply(ctx) {
  if (!(ctx instanceof Context)) throw new Error('desktop runtime: external plugin loaded another Cordis instance')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke',
    handler(_request, response) { response.end('plugin route ready') } }))
  // Diagnostic is deliberately smoke-only, not part of the shipped runtime.
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-diagnostics',
    handler(_request, response) {
      const services = ['webServer', 'sessions', 'agents', 'workspaceRegistry',
        'sessionQuery', 'permissionPresets', 'agentPresets', 'llm', 'attachments', 'commands']
      const missing = services.filter(name => ctx.get(name) === undefined)
      const entries = [...(ctx.get('loader')?.entries?.() ?? [])]
        .filter(entry => ['side-chat', 'llm-retry-settings'].some(key =>
          String(entry.options?.id ?? entry.id ?? '').includes(key)
          || String(entry.options?.name ?? '').includes(key)))
        .map(entry => ({
          id: entry.options?.id, name: entry.options?.name,
          disabled: entry.disabled, state: String(entry.fiber?.state ?? entry.state ?? ''),
          moduleLoaded: entry.moduleNamespace !== undefined,
          keys: Object.keys(entry).slice(0, 16),
          error: String(entry.fiber?.error ?? '').slice(0, 800),
        }))
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ missing, entries }))
    } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-computer-use',
    async handler(_request, response) {
      try {
        const presetId = "desktop-computer-use"
        const resolved = await ctx.agentPresets.resolve(presetId)
        const inventory = await ctx.agentPresets.compositionInventory()
        const rows = inventory.find(row => row.id === presetId)?.rows
        // Use the same scoped tool-schema projection as the model request.
        const lease = await ctx.agentPresets.acquireScope(presetId)
        let toolNames
        try {
          toolNames = ctx.tools.schemas(lease.key).map(schema => schema.name)
        } finally {
          await lease[Symbol.asyncDispose]()
        }
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({
          id: resolved.id,
          broken: resolved.broken ?? null,
          defaultId: ctx.agentPresets.defaultId,
          operatorMounted: JSON.stringify(rows ?? []).includes('dsh-desktop-operator'),
          toolNames,
        }))
      } catch (error) {
        response.statusCode = 500
        response.end(inspect(error, { depth: 5 }))
      }
    } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-install',
    async handler(_request, response) {
      try {
        response.end(JSON.stringify(await ctx.pluginManager.installBundle(${JSON.stringify(installedPlugin)})))
      } catch (error) {
        response.statusCode = 500
        response.end(inspect(error, { depth: 5 }))
      }
    } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-office-cli',
    async handler(_request, response) {
      try {
        const skill = await ctx.skills.get('office-export-pdf')
        const json = skill?.content.match(/\\n(\\{\\n[\\s\\S]+)$/u)?.[1]
        if (json === undefined) throw new Error('Office skill did not supply CLI paths')
        const { libreofficeKit: { node, cli } } = JSON.parse(json)
        const options = { cwd: ${JSON.stringify(home)}, env: { ...process.env, PATH: '' }, timeout: 120_000 }
        const capabilities = await promisify(execFile)(node, [cli, 'capabilities'], options)
        const output = ${JSON.stringify(join(home, 'cli.pdf'))}
        await promisify(execFile)(node, [cli, 'convert', '--input', ${JSON.stringify(join(home, 'input.docx'))}, '--output', output], options)
        response.end(JSON.stringify({ capabilities: JSON.parse(capabilities.stdout), pdf: (await readFile(output)).toString('base64') }))
      } catch (error) {
        response.statusCode = 500
        response.end(inspect(error, { depth: 5 }))
      }
    } }))
  for (const input of ${JSON.stringify(inputs)}) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-office/' + input.extension,
      async handler(_request, response) {
        try {
          const bytes = Buffer.from(input.bytes, 'base64')
          const result = await ctx.officeToPdf.convert({ extension: input.extension, priority: 'foreground',
            source: { key: 'desktop-smoke-' + input.extension, version: 'fixture', bytes: bytes.length,
              async read() { return { bytes, version: 'fixture' } } } })
          response.end(Buffer.from(result.pdf))
        } catch (error) {
          response.statusCode = 500
          response.end(inspect(error, { depth: 5 }))
        }
      } }))
  }
}
`)
    writeFileSync(join(plugin, 'bundle.yml'), '- insert:\n    - id: desktop-runtime-smoke-plugin\n      name: desktop-runtime-smoke-plugin\n      inject: [webServer, officeToPdf, skills, pluginManager, agentPresets, tools]\n')
    cpSync(plugin, join(profile, 'node_modules', pluginName), { recursive: true })
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    manifest.dependencies = { ...manifest.dependencies, [pluginName]: `file:${plugin}` }
    manifest.dsh.profile.bundles.push(pluginName)
    writeFileSync(join(profile, 'package.json'), JSON.stringify(manifest))
    writeFileSync(join(profile, 'cordis.patch.yml'), '- id: webserver\n  config:\n    host: 127.0.0.1\n    port: 0\n')
    const ready = await Promise.race([host.start(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error('desktop runtime: Host readiness exceeded 120 seconds')) }, 120_000)
    })])
    clearTimeout(timer)
    const login = await fetch(ready.url, { redirect: 'manual' })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const response = await fetch(new URL('/', ready.url), { headers: { cookie } })
    if (response.status !== 200 || !(await response.text()).includes('<html')) {
      throw new Error('desktop runtime: packaged frontend smoke failed')
    }
    if (process.platform === 'win32') {
      // The bundled side chat must respond without running pnpm or contacting a registry.
      const sideChat = await fetch(new URL('/sidechat/api/__desktop_offline_smoke__', ready.url), {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}',
        signal: AbortSignal.timeout(30_000),
      })
      // Preserve status and body in the error so a missing route is not hidden
      // behind JSON.parse(""), and do not weaken the original route assertion.
      const responseType = sideChat.headers.get('content-type')
      const sideChatText = await sideChat.text()
      let sideChatResult: { error?: { code?: string; message?: string } } | undefined
      try {
        sideChatResult = JSON.parse(sideChatText) as typeof sideChatResult
      } catch {
        // The expected plugin always returns JSON, including for unknown methods.
      }
      if (sideChat.status !== 404 || sideChatResult?.error?.code !== 'not-found'
        || !sideChatResult.error.message?.includes('unknown sidechat API method')) {
        const diagnostics = await fetch(new URL('/desktop-smoke-diagnostics', ready.url),
          { headers: { cookie }, signal: AbortSignal.timeout(15_000) }).then(async result => result.ok ? await result.text() : `probe HTTP ${result.status}`)
          .catch(error => `probe error ${String(error)}`)
        throw new Error(`desktop runtime: offline ${BUNDLED_SIDE_CHAT.name} API not mounted or unhealthy: `
          + `status=${sideChat.status} type=${JSON.stringify(responseType)} body=${JSON.stringify(sideChatText.slice(0, 512))}`
          + ` diagnostics=${diagnostics.slice(0, 1800)}`
          + ` hostStderr=${JSON.stringify(host.getRecentStderr().replace(/(?:token=)[A-Za-z0-9_-]+/gu, 'token=[redacted]').slice(-2800))}`)
      }
      console.log('desktop runtime: bundled side chat host routes passed')
      // A bundled package is not enough: the actual Host loader must activate it.
      const retryProbe = await fetch(new URL('/desktop-smoke-diagnostics', ready.url), {
        headers: { cookie }, signal: AbortSignal.timeout(15_000),
      })
      if (!retryProbe.ok) throw new Error(`desktop LLM retry: diagnostics failed HTTP ${retryProbe.status}`)
      const retryState = await retryProbe.json() as {
        entries?: Array<{ id?: string; name?: string; disabled?: boolean; moduleLoaded?: boolean; error?: string }>
      }
      if (!retryState.entries?.some(entry => entry.name === BUNDLED_LLM_RETRY.name
        && entry.disabled !== true && entry.moduleLoaded === true && !entry.error)) {
        throw new Error(`desktop LLM retry: Host settings plugin not active: ${JSON.stringify(retryState.entries)}`)
      }
      console.log('desktop runtime: bundled LLM retry settings Host active')
    }
    if (process.platform === 'win32') {
      // Validate that the preset is actually registered and its tool plugin
      // mounted, rather than merely checking the generated YAML text.
      const presetResponse = await fetch(new URL('/desktop-smoke-computer-use', ready.url), {
        headers: { cookie }, signal: AbortSignal.timeout(30_000),
      })
      if (!presetResponse.ok) {
        throw new Error(`desktop Computer Use: preset activation failed: ${await presetResponse.text()}`)
      }
      const preset = await presetResponse.json() as {
        id: string; broken: string | null; defaultId: string; operatorMounted: boolean; toolNames: string[]
      }
      if (preset.id !== DESKTOP_OPERATOR_PRESET_ID || preset.broken !== null
        || preset.defaultId !== DESKTOP_OPERATOR_PRESET_ID || !preset.operatorMounted
        || !preset.toolNames.some(name => /desktop|computer|operator/iu.test(name))) {
        throw new Error(`desktop Computer Use: preset not active: ${JSON.stringify(preset)}`)
      }
      console.log('desktop runtime: Computer Use preset registered and tool mounted')
    }
    const pluginResponse = await fetch(new URL('/desktop-smoke', ready.url), { headers: { cookie } })
    if (await pluginResponse.text() !== 'plugin route ready') throw new Error('desktop runtime: plugin HTTP route failed')
    const installation = await fetch(new URL('/desktop-smoke-install', ready.url), {
      headers: { cookie }, signal: AbortSignal.timeout(120_000),
    })
    const installationResult = await installation.text()
    const installed = await fetch(new URL('/desktop-smoke-installed', ready.url), { headers: { cookie } })
    if (!installation.ok || !installed.ok || await installed.text() !== 'installed plugin ready') {
      throw new Error(`desktop runtime: bundled pnpm plugin installation failed: ${installationResult}`)
    }
    for (const { extension } of inputs) {
      const converted = await fetch(new URL(`/desktop-smoke-office/${extension}`, ready.url), {
        headers: { cookie }, signal: AbortSignal.timeout(120_000),
      })
      if (!converted.ok) throw new Error(`desktop runtime: ${extension} conversion failed: ${await converted.text()}`)
      const pdf = Buffer.from(await converted.arrayBuffer())
      if (!/^%PDF-\d\.\d/u.test(pdf.subarray(0, 8).toString())
        || !pdf.subarray(-1024).toString().trimEnd().endsWith('%%EOF')) {
        throw new Error(`desktop runtime: invalid ${extension} PDF output`)
      }
    }
    const cliResponse = await fetch(new URL('/desktop-smoke-office-cli', ready.url), {
      headers: { cookie }, signal: AbortSignal.timeout(120_000),
    })
    if (!cliResponse.ok) throw new Error(`desktop runtime: skill CLI failed: ${await cliResponse.text()}`)
    const cliResult = await cliResponse.json() as { capabilities: { runtime: { cliPath: string } }; pdf: string }
    if (!cliResult.capabilities.runtime.cliPath.endsWith('cli.js') || Buffer.from(cliResult.pdf, 'base64').subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('desktop runtime: skill CLI did not return capabilities and a PDF')
    }
    console.log('desktop runtime: DOCX, XLSX, PPTX to PDF and skill CLI discovery passed')
  } finally {
    clearTimeout(timer)
    try { await host.stop() } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    }
  }
}
