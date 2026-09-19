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
const editor = page => page.locator('[contenteditable="true"]:visible').first()
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
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
      // Let layout and CSS zoom paint before capturing the review viewport.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`${experience}-${name}.png`), fullPage: false, animations: 'disabled' })
      await page.getByRole('button', { name: experience === 'browser' ? 'Settings' : 'Open settings', exact: true }).click()
      await expect(page.getByText('Appearance', { exact: true }).first()).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`${experience}-${name}-settings.png`), fullPage: false, animations: 'disabled' })
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
  await page.getByRole('tab', { name: 'Sessions', exact: true }).click()
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
  await page.getByRole('tab', { name: 'Sessions', exact: true }).click()
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

for (const phone of [false, true]) {
  test(`browser contributed panels open, close and reopen on ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 960 })
    await open(page, 'browser')
    await editor(page).fill('Keep my draft while using tools')
    const tools = page.getByRole('navigation', { name: 'Tools', exact: true })
    const showTools = async () => {
      if (phone) await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
      await page.getByRole('tab', { name: 'Tools', exact: true }).click()
    }
    for (const name of ['files', 'review']) {
      await showTools()
      const entry = tools.getByRole('button', { name, exact: true })
      await entry.click()
      const close = phone
        ? page.getByRole('button', { name: `Close ${name} panel`, exact: true })
        : page.locator(`[data-tree-tab="${name}"]`).getByRole('button', { name: 'Close', exact: true })
      await expect(close).toBeVisible()
      await close.click()
      await expect(close).toBeHidden()
      await showTools()
      await entry.click()
      await expect(close).toBeVisible()
      if (phone) {
        await close.focus()
        await page.keyboard.press('Enter')
      } else {
        await expect(entry).toHaveAttribute('aria-pressed', 'true')
        await entry.focus()
        await page.keyboard.press('Enter')
        await expect(entry).toHaveAttribute('aria-pressed', 'false')
      }
      await expect(close).toBeHidden()
    }
    await expect(editor(page)).toContainText('Keep my draft while using tools')
    expect(new URL(page.url()).hash).toBe('#/preview-week')
  })
}

test('browser panels close after visiting Starmap without opening a conversation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${origin}/?experience=browser#/starmap`)
  await expect(selector(page)).toBeEnabled({ timeout: 15000 })
  await expect(page.getByText('Nothing learned yet', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close memory graph', exact: true }).click()
  await page.getByRole('tab', { name: 'Tools', exact: true }).click()
  for (const name of ['files', 'review']) {
    await page.getByRole('navigation', { name: 'Tools', exact: true }).getByRole('button', { name, exact: true }).click()
    const close = page.locator(`[data-tree-tab="${name}"]`).getByRole('button', { name: 'Close', exact: true })
    await expect(close).toBeVisible()
    await close.click()
    await expect(close).toBeHidden()
  }
  await expect(page.getByText('Something broke in the interface', { exact: true })).toBeHidden()
})

for (const width of [390, 1440]) {
  test(`browser status controls and details stay accessible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 })
    await open(page, 'browser')
    const status = page.getByRole('region', { name: 'Gateway and session status', exact: true })
    await expect(status.getByRole('button', { name: /^Gateway/ })).toBeVisible()
    await status.getByRole('button', { name: 'Smart', exact: true }).click()
    await expect(page.getByRole('menuitemradio', { name: /^Manual/ })).toBeVisible()
    await page.keyboard.press('Escape')
    const trigger = status.getByRole('button', { name: 'Connection and session details', exact: true })
    await trigger.click()
    const details = page.getByRole('dialog', { name: 'Connection and session details', exact: true })
    await expect(details.getByRole('button', { name: /client v/ })).toBeVisible()
    await expect(details.getByRole('button', { name: /backend vsynthetic-preview/ })).toBeVisible()
    const bounds = await details.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(960)
    expect(await details.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`browser-status-${width}.png`), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()
    await expect(trigger).toBeFocused()
  })
}

for (const experience of ['desktop', 'browser']) {
  test(`${experience}: new chat uses the shared composer and can reopen its session link`, async ({ page }) => {
    await open(page, experience)
    await page.getByRole('button', { name: 'New session', exact: true }).click()
    await editor(page).fill(`New ${experience} conversation`)
    await editor(page).press('Enter')
    await expect(selector(page)).toBeDisabled()
    await expect(selector(page)).toBeEnabled({ timeout: 15000 })
    await expect(page.getByText('No external model was called.', { exact: false }).last()).toBeVisible()
    const { sessions } = await (await page.request.get(`${origin}/api/sessions`)).json()
    const created = sessions.find(session => session.title === `New ${experience} conversation`)
    expect(created?.id).toMatch(/^preview-new-/)
    await page.goto(`${origin}/?experience=${experience}#/${created.id}`)
    await expect(page.getByText(`New ${experience} conversation`, { exact: true }).first()).toBeVisible()
  })
}

for (const phone of [false, true]) {
  test(`all browser Workspace controls open their views on ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
    test.setTimeout(120000)
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 960 })
    await open(page, 'browser')
    await editor(page).fill('Preserve this workspace navigation draft')
    const views = [
      ['command center', 'command-center', 'Search and manage sessions'],
      ['skills', 'skills', 'preview-planning'],
      ['messaging', 'messaging', 'Discord'],
      ['webhooks', 'webhooks', 'No webhook subscriptions yet.'],
      ['artifacts', 'artifacts', 'No artifacts found'],
      ['cron', 'cron', 'No scheduled jobs yet'],
      ['profiles', 'profiles', 'Research'],
      ['agents', 'agents', 'No live subagents'],
      ['starmap', 'starmap', 'Nothing learned yet']
    ]
    for (const [name, route, content] of views) {
      if (phone) await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
      await page.getByRole('tab', { name: 'Tools', exact: true }).click()
      await page.getByRole('navigation', { name: 'Tools', exact: true }).getByRole('button', { name, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`#/${route}$`))
      const screen = route === 'command-center'
        ? page.getByRole('textbox', { name: 'Search sessions, views, and actions', exact: true })
        : page.getByText(content, { exact: true }).filter({ visible: true }).first()
      await expect(screen).toBeVisible({ timeout: 15000 })
      await expect(page.getByText(/failed to render|Something broke in the interface/)).toBeHidden()
      await page.goBack()
      await expect(editor(page)).toContainText('Preserve this workspace navigation draft')
    }
  })
}

test('an interrupted startup module retries once and preserves the selected route', async ({ page }) => {
  let failed = false
  await page.route('**/assets/entry-*.js', async route => {
    if (!failed) { failed = true; await route.abort('failed') } else await route.continue()
  })
  await open(page, 'browser', 'preview-idea')
  expect(failed).toBe(true)
  expect(new URL(page.url()).hash).toBe('#/preview-idea')
  await expect(page.getByText('A useful starting point', { exact: false })).toBeVisible()
})

test('persistent module failure stops at the recovery screen without a reload loop', async ({ page }) => {
  let documents = 0
  page.on('request', request => { if (request.isNavigationRequest()) documents++ })
  await page.route('**/assets/entry-*.js', route => route.abort('failed'))
  await page.goto(`${origin}/?experience=browser#/preview-idea`)
  await expect(page.getByRole('button', { name: 'Reload Hermes' })).toBeVisible({ timeout: 15000 })
  expect(documents).toBe(2)
})

for (const experience of ['desktop', 'browser']) {
  for (const phone of [false, true]) {
    test.describe(`${experience} chat menus on ${phone ? 'phone' : 'desktop'}`, () => {
      const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 960 }
      test.use({ viewport, hasTouch: phone, isMobile: phone })
      test('stay anchored and inside the viewport at different UI scales', async ({ page }) => {
        await open(page, experience, 'preview-idea')
        for (const scale of [90, 100, 125]) {
          await page.evaluate(percent => window.hermesDesktop.zoom.setPercent(percent), scale)
          for (const [name, align, gap] of [[/^Model ·/, 'end', 8], ['Add context', 'start', 6]]) {
            // Radix hides background controls from accessibility queries while
            // a modal menu is open; keep the trigger available for measurement.
            const trigger = page.getByRole('button', { name, includeHidden: true })
            await trigger.click()
            const menu = page.locator('[data-slot="dropdown-menu-content"]:visible')
            await expect(menu).toBeVisible()
            await expect(menu).toHaveAttribute('data-side', 'top')
            await expect.poll(async () => {
              const anchor = await trigger.boundingBox(), popup = await menu.boundingBox()
              if (!anchor || !popup) return Infinity
              return Math.abs(anchor.y - popup.y - popup.height - gap)
            }).toBeLessThan(1.5)
            const anchor = await trigger.boundingBox(), popup = await menu.boundingBox()
            const alignedX = align === 'end' ? anchor.x + anchor.width - popup.width : anchor.x
            const expectedX = Math.max(8, Math.min(alignedX, viewport.width - popup.width - 8))
            expect(Math.abs(popup.x - expectedX)).toBeLessThan(1.5)
            expect(popup.y).toBeGreaterThanOrEqual(0)
            expect(popup.x).toBeGreaterThanOrEqual(0)
            expect(popup.x + popup.width).toBeLessThanOrEqual(viewport.width)
            expect(popup.y + popup.height).toBeLessThanOrEqual(viewport.height)
            await page.keyboard.press('Escape')
            await expect(menu).toBeHidden()
          }
        }
      })
    })
  }
}
