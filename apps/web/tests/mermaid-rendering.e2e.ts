/** Cold-replayed Mermaid fences render sanitized SVG through the shipped Web composition. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/mermaid-rendering', import.meta.url))
const MODE = webSnapshotMode()

describe('web e2e: Mermaid fences', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const id = await seedSession(scaffold, await readFile(join(DIR, 'session.v4.jsonl'), 'utf8'), 'mermaid-rendering')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const workspace = page.getByRole('treeitem').first()
    await workspace.waitFor()
    if (await workspace.getAttribute('aria-expanded') !== 'true') await workspace.click()
    await page.locator(`[data-row-key="session:${id}"]`).click()
    await page.locator('[data-mermaid-diagram] svg').waitFor({ timeout: 30_000 })
    await page.locator('[data-mermaid-failure]').waitFor({ timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the valid fence and keeps the invalid fence as source with its localized notice', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mermaid-rendering'))
    expect(await page.locator('[data-mermaid-diagram] svg').count()).toBe(1)
    expect(await page.locator('[data-mermaid-diagram] svg text').allTextContents()).toContain('Start')
    expect(await page.locator('[data-mermaid-failure]').innerText())
      .toContain('Mermaid diagram could not be rendered. Showing its source.')
    expect(await page.locator('[data-mermaid-failure] pre code').innerText()).toContain('not a diagram')
    // The sanitizer strips every resource-loading attribute before insertion.
    expect(await page.locator('[data-mermaid-diagram] [href^="http"], [data-mermaid-diagram] [src]').count()).toBe(0)

    const snapshot = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split('mermaid-rendering').join('{{seededId}}')
    await compareOrRefreshGolden(join(DIR, 'ui.expected.md'), snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(DIR, ['session.v4.jsonl', 'ui.expected.md'])
  }, 60_000)
})
