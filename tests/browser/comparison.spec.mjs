import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createPreviewGateway } from '../../scripts/preview/gateway.mjs'

// The stable compatibility job runs the separate safety suite; this suite uses
// the comparison image from the review-image job (or an explicitly supplied URL).
test.use({ actionTimeout: 15000 })
test.skip(!process.env.HERMES_COMPARISON_IMAGE && !process.env.HERMES_COMPARISON_URL, 'Comparison build only')
let gateway, container, origin

test.beforeAll(async () => {
  if (process.env.HERMES_COMPARISON_URL) { origin = process.env.HERMES_COMPARISON_URL; return }
  gateway = createPreviewGateway()
  await new Promise(resolve => gateway.server.listen(0, '0.0.0.0', resolve))
  container = execFileSync('docker', ['run', '-d', '--rm', '--add-host', 'host.docker.internal:host-gateway', '-p', '127.0.0.1::80', '-e', `HERMES_GATEWAY_URL=http://host.docker.internal:${gateway.server.address().port}`, '-e', 'HERMES_GATEWAY_NAME=Preview workspace', process.env.HERMES_COMPARISON_IMAGE], { encoding: 'utf8' }).trim()
  const port = execFileSync('docker', ['port', container, '80/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1)
  origin = `http://127.0.0.1:${port}`
  await expect.poll(async () => { try { return (await fetch(origin)).status } catch { return 0 } }).toBe(200)
})
test.afterAll(async () => {
  if (container) execFileSync('docker', ['stop', container], { stdio: 'ignore' })
  await gateway?.close()
})
const selector = page => page.getByLabel('Experience', { exact: true })
const editor = page => page.locator('[contenteditable="true"]').first()
async function open(page, experience, session = 'preview-week') {
  await page.goto(`${origin}/?experience=${experience}#/${session}`)
  await expect(editor(page)).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Help me make a thoughtful plan.', { exact: true }).first()).toBeVisible({ timeout: 15000 })
  await expect(selector(page)).toBeEnabled()
}

for (const experience of ['desktop', 'browser']) {
  test(`${experience}: streaming, cancellation, reopening, and draft-safe switching`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await open(page, experience)
    await editor(page).fill(`A ${experience} comparison message`)
    await editor(page).press('Enter')
    await expect(selector(page)).toBeDisabled()
    await expect(page.locator('.experience-reason')).toContainText('active response')
    await expect(selector(page)).toBeEnabled({ timeout: 15000 })
    await expect(page.getByText('No external model was called.', { exact: false }).last()).toBeVisible()
    await page.reload()
    await expect(page.getByText(`A ${experience} comparison message`, { exact: true }).first()).toBeVisible()
    await editor(page).fill('Preserve this unsent text')
    await selector(page).selectOption(experience === 'desktop' ? 'browser' : 'desktop')
    await expect(editor(page)).toContainText('Preserve this unsent text', { timeout: 15000 })
    expect(new URL(page.url()).hash).toBe('#/preview-week')
    await editor(page).fill('Cancel this response')
    await editor(page).press('Enter')
    await expect(selector(page)).toBeDisabled()
    // Escape is the upstream cancellation shortcut in the composer.
    await editor(page).press('Escape')
    await expect(page.getByText('Response cancelled.', { exact: false }).last()).toBeVisible()
    await expect(selector(page)).toBeEnabled({ timeout: 15000 })
    expect(errors).toEqual([])
  })

  for (const [name, viewport] of [['desktop', { width: 1440, height: 960 }], ['phone', { width: 390, height: 844 }]]) {
    test.describe(`${experience}-${name}`, () => {
    test.use({ viewport, hasTouch: name === 'phone', isMobile: name === 'phone' })
    test(`layout and settings`, async ({ page }, testInfo) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message))
      await page.setViewportSize(viewport)
      await open(page, experience, 'preview-idea')
      const bounds = await editor(page).boundingBox()
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`${experience}-${name}.png`), fullPage: true })
      await page.getByRole('button', { name: experience === 'browser' ? 'Settings' : 'Open settings', exact: true }).click()
      await expect(page.getByText('Appearance', { exact: true }).first()).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`${experience}-${name}-settings.png`), fullPage: true })
      expect(errors).toEqual([])
    })
    })
  }
}

test('browser drawer, repeated Bot selection, Tools and profile survive comparison switching', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, 'browser')
  for (const name of ['Research', 'Writer', 'Research']) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.getByRole('tab', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(`^${name} · @`) }).click()
    await expect(page).toHaveURL(new RegExp(`#/preview-${name.toLowerCase()}$`))
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false')
    await expect(selector(page)).toBeEnabled()
  }
  await editor(page).fill('A research draft')
  await selector(page).selectOption('desktop')
  await expect(editor(page)).toContainText('A research draft', { timeout: 15000 })
  expect(new URL(page.url()).hash).toBe('#/preview-research')
  await selector(page).selectOption('browser')
  await expect(editor(page)).toContainText('A research draft', { timeout: 15000 })
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await page.getByLabel('Profile', { exact: true }).selectOption('research')
  await page.getByRole('tab', { name: 'Tools', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Tools', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused()
  await selector(page).selectOption('desktop')
  await expect(selector(page)).toBeEnabled()
  expect(await page.evaluate(async () => (await window.hermesDesktop.getConnection()).profile)).toBe('research')
  await selector(page).selectOption('browser')
  await expect(selector(page)).toBeEnabled()
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(page.getByLabel('Profile', { exact: true })).toHaveValue('research')
  expect(errors).toEqual([])
})

for (const experience of ['desktop', 'browser']) {
  test(`${experience}: file picker and pasted images prevent unsafe switching`, async ({ page }) => {
    await open(page, experience, 'preview-idea')
    await page.getByRole('button', { name: 'Add context', exact: true }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByText('Files…', { exact: true }).click()
    await (await chooser).setFiles({ name: 'review.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic review attachment') })
    await expect(selector(page)).toBeDisabled()
    await expect(page.locator('.experience-reason')).toContainText('unsent attachments')
    await page.getByRole('button', { name: 'Remove review.txt', exact: true }).click()
    await expect(selector(page)).toBeEnabled()
    await editor(page).evaluate(async element => {
      const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      const data = new DataTransfer(); data.items.add(new File([blob], 'pasted.png', { type: 'image/png' }))
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }))
    })
    await expect(selector(page)).toBeDisabled()
    await expect(page.locator('.experience-reason')).toContainText('unsent attachments')
  })
}

test('browser keyboard tabs, reduced motion, dark theme, and zoom stay usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.setViewportSize({ width: 820, height: 1180 })
  await open(page, 'browser', 'preview-idea')
  await page.getByRole('tab', { name: 'Sessions', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Bots', exact: true })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Bots', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.evaluate(() => window.hermesDesktop.zoom.setPercent(125))
  const bounds = await editor(page).boundingBox()
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(1180)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
