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
  it('switches category tabs, collapses the group, resolves bundled skills and carries history into a draft', async () => {
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
      const collapse = dock.getByRole('button', { name: 'Collapse coding buttons' })
      await collapse.waitFor()
      const evidenceDirectory = fileURLToPath(new URL('../../../.artifacts', import.meta.url))
      await mkdir(evidenceDirectory, { recursive: true })
      await page.screenshot({ path: join(evidenceDirectory, `launcher-${process.pid}-wide.png`), fullPage: true })
      await compareOrRefreshGolden(expected, await captureStableAria(page, '[data-matt-skill-launcher]', scaffold.workspaceCwd), webSnapshotMode())
      await collapse.click()
      expect(await dock.getByRole('button', { name: 'Develop', exact: true }).count()).toBe(0)
      expect(await dock.getByRole('tab', { name: 'Documents', exact: true }).count()).toBe(0)
      await dock.getByRole('button', { name: 'Expand coding buttons' }).click()
      const initialize = dock.getByRole('button', { name: 'Initialize', exact: true })
      await initialize.waitFor()
      await dock.getByRole('tab', { name: 'Documents', exact: true }).click()
      await dock.getByRole('button', { name: 'API Documentation', exact: true }).waitFor()
      expect(await initialize.count()).toBe(0)
      await dock.getByRole('tab', { name: 'Documents', exact: true }).focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => dock.getByRole('tab', { name: 'Utilities', exact: true }).getAttribute('aria-selected')).toBe('true')
      await dock.getByRole('button', { name: 'Context Handoff', exact: true }).waitFor()
      const input = page.locator('[data-composer-input]').first()
      await writeComposerDraft(page, input, '')
      await input.focus()
      await dock.getByRole('button', { name: 'Develop', exact: true }).click()
      await expect.poll(() => input.innerText()).toMatch(/^\/implement /)
      expect(await input.innerText()).toContain('DONE')
      expect(await input.innerText()).toContain('Verify the target spec or ticket')
      await writeComposerDraft(page, input, '')
      await input.focus()
      await dock.getByRole('button', { name: 'Context Handoff', exact: true }).click()
      await expect.poll(() => input.innerText()).toMatch(/^\/handoff /)
      expect(await input.innerText()).toContain('finding IDs, pending work, blockers')
      expect(await input.innerText()).toContain('DONE')
      await page.setViewportSize({ width: 390, height: 900 })
      expect(await dock.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      const panel = await dock.boundingBox()
      expect(panel?.y).toBeGreaterThanOrEqual(75)
      await dock.getByRole('tab', { name: 'More', exact: true }).click()
      await dock.getByRole('button', { name: 'Prototype', exact: true }).waitFor()
      await page.screenshot({ path: join(evidenceDirectory, `launcher-${process.pid}-narrow.png`), fullPage: true })
      const chinese = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' })
      await chinese.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await chinese.getByRole('treeitem').first().click()
      await chinese.getByRole('treeitem').nth(1).click()
      const zhDock = chinese.locator('[data-matt-skill-launcher]')
      await zhDock.getByRole('button', { name: '开发', exact: true }).waitFor()
      await zhDock.getByRole('tab', { name: '辅助操作', exact: true }).click()
      await zhDock.getByRole('button', { name: '修复审核问题', exact: true }).waitFor()
      await chinese.screenshot({ path: join(evidenceDirectory, `launcher-${process.pid}-zh.png`), fullPage: true })
    } finally {
      try { await browser?.close() } finally { await scaffold.close() }
    }
  }, 120_000)
})
