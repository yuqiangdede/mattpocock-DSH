import { cp, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { describe, it, expect } from 'vitest'
import { launchWebScaffold, seedSession, captureStableAria, compareOrRefreshGolden, webSnapshotMode } from './scaffold.ts'
import { newEnglishPage, writeComposerDraft } from './support.ts'

const fixture = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const expected = fileURLToPath(new URL('./expected/matt-skill-launcher/buttons.expected.md', import.meta.url))

describe('Skill Launcher on recorded session history', () => {
  it('expands More, resolves bundled skills and carries history into a draft', async () => {
    const scaffold = await launchWebScaffold({})
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    try {
      const skills = join(scaffold.workspaceCwd, '.agents', 'skills')
      await mkdir(skills, { recursive: true })
      await cp(fileURLToPath(new URL('../../../.dsh/skills', import.meta.url)), skills, { recursive: true })
      await seedSession(scaffold, await readFile(fixture, 'utf8'), 'launcher-recorded-history')
      const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
      browser = await chromium.launch(executablePath ? { executablePath } : {})
      const page = await newEnglishPage(browser)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      const group = page.getByRole('treeitem').first()
      await group.waitFor({ timeout: 30_000 })
      await group.click()
      await page.getByRole('treeitem').nth(1).click()
      await page.getByText('DONE', { exact: true }).waitFor({ timeout: 15_000 })
      const dock = page.locator('[data-matt-skill-launcher]')
      const more = dock.getByRole('button', { name: 'More', exact: true })
      await more.waitFor()
      const evidenceDirectory = fileURLToPath(new URL('../../../.artifacts', import.meta.url))
      await mkdir(evidenceDirectory, { recursive: true })
      await page.screenshot({ path: join(evidenceDirectory, `launcher-${process.pid}-wide.png`), fullPage: true })
      await compareOrRefreshGolden(expected, await captureStableAria(page, '[data-matt-skill-launcher]', scaffold.workspaceCwd), webSnapshotMode())
      expect(await dock.getByRole('button', { name: 'Initialize', exact: true }).count()).toBe(0)
      await more.click()
      expect(await more.getAttribute('aria-expanded')).toBe('true')
      const initialize = dock.getByRole('button', { name: 'Initialize', exact: true })
      await initialize.waitFor()
      await dock.getByRole('button', { name: 'API Documentation', exact: true }).waitFor()
      await more.click()
      expect(await more.getAttribute('aria-expanded')).toBe('false')
      expect(await initialize.count()).toBe(0)
      const input = page.locator('[data-composer-input]').first()
      await writeComposerDraft(page, input, '')
      await input.focus()
      await dock.getByRole('button', { name: 'Develop', exact: true }).click()
      await expect.poll(() => input.innerText()).toMatch(/^\/implement /)
      expect(await input.innerText()).not.toContain('DONE')
      expect(await input.innerText()).toContain('Verify the target spec or ticket')
      await writeComposerDraft(page, input, '')
      await input.focus()
      await dock.getByRole('button', { name: 'Fix Review Findings', exact: true }).click()
      await expect.poll(() => input.innerText()).toContain('finding IDs, priorities')
      expect(await input.innerText()).toContain('DONE')
      await writeComposerDraft(page, input, '')
      await input.focus()
      await more.click()
      await dock.getByRole('button', { name: 'Context Handoff', exact: true }).click()
      await expect.poll(() => input.innerText()).toMatch(/^\/handoff /)
      expect(await input.innerText()).toContain('finding IDs, pending work, blockers')
      expect(await input.innerText()).not.toContain('DONE')
      await more.click()
      expect(await more.getAttribute('aria-expanded')).toBe('false')
      await page.setViewportSize({ width: 390, height: 900 })
      expect(await dock.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      const panel = await dock.boundingBox()
      expect(panel?.y).toBeGreaterThanOrEqual(75)
      await more.click()
      await dock.getByRole('button', { name: 'Prototype', exact: true }).waitFor()
      await page.screenshot({ path: join(evidenceDirectory, `launcher-${process.pid}-narrow.png`), fullPage: true })
      const chinese = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' })
      await chinese.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await chinese.getByRole('treeitem').first().click()
      await chinese.getByRole('treeitem').nth(1).click()
      const zhDock = chinese.locator('[data-matt-skill-launcher]')
      await zhDock.getByRole('button', { name: '开发', exact: true }).waitFor()
      await zhDock.getByRole('button', { name: '修复审核问题', exact: true }).waitFor()
      await zhDock.getByRole('button', { name: '编译', exact: true }).waitFor()
      await zhDock.getByRole('button', { name: '更多', exact: true }).click()
      await zhDock.getByRole('button', { name: '初始化', exact: true }).waitFor()
      await chinese.screenshot({ path: join(evidenceDirectory, `launcher-${process.pid}-zh.png`), fullPage: true })
    } finally {
      try { await browser?.close() } finally { await scaffold.close() }
    }
  }, 120_000)
})
