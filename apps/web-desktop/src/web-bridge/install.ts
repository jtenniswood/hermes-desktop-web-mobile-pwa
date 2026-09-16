/**
 * Side-effect module: installs the web bridge as `window.hermesDesktop`.
 *
 * MUST be the first import in `main.tsx`. Several stores touch the bridge at
 * module-evaluation time (store/translucency, store/zoom, lib/clipboard), and
 * ES module imports execute in order, so this file has to run before them.
 *
 * Installation is skipped when a bridge already exists so the same source
 * tree still works under Electron and under test mocks.
 */
import { createWebBridge } from './bridge'

/**
 * Keep the app shell tied to the visible viewport on mobile browsers. Safari
 * and iOS Chrome resize only the visual viewport when the keyboard appears;
 * publishing its height lets the CSS wrapper reclaim the space above it.
 */
function installMobileViewportBridge(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return

  const viewport = window.visualViewport
  if (!viewport) return

  const update = (): void => {
    const height = Math.max(1, Math.ceil(viewport.height))
    document.documentElement.style.setProperty('--hermes-visual-height', `${height}px`)
    document.documentElement.style.setProperty(
      '--hermes-visual-offset-top',
      `${Math.ceil(viewport.offsetTop)}px`
    )
    document.documentElement.toggleAttribute(
      'data-hermes-keyboard',
      window.innerHeight - viewport.height > 120
    )
  }

  update()
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  window.addEventListener('resize', update)
}

/**
 * Radix context menus support long press, but the browser's gesture heuristics
 * differ across iOS and Android. This small fallback dispatches the same
 * `contextmenu` event on marked triggers when a stationary touch is held.
 * Movement and cancellation always disarm it, so normal scrolling is retained.
 */
function installLongPressFallback(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return

  let timer: number | undefined
  let activeTarget: Element | null = null
  let startX = 0
  let startY = 0

  const cancel = (): void => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
    activeTarget = null
  }

  window.addEventListener('contextmenu', event => {
    if (activeTarget && event.target instanceof Node && activeTarget.contains(event.target)) cancel()
  }, true)

  window.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return
    const target = event.target instanceof Element
      ? event.target.closest('[data-hermes-context-menu-trigger]')
      : null
    if (!target) return

    cancel()
    activeTarget = target
    startX = event.clientX
    startY = event.clientY
    // Radix normally opens after its own long-press delay. Give it first
    // opportunity so this fallback only covers browsers where that gesture is
    // swallowed before reaching the renderer.
    timer = window.setTimeout(() => {
      if (!activeTarget) return
      const synthetic = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: startX,
        clientY: startY,
        button: 2,
        buttons: 2
      })
      activeTarget.dispatchEvent(synthetic)
      cancel()
    }, 900)
  }, true)

  window.addEventListener('pointermove', event => {
    if (
      event.pointerType === 'touch' &&
      (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8)
    ) {
      cancel()
    }
  }, true)
  window.addEventListener('pointerup', cancel, true)
  window.addEventListener('pointercancel', cancel, true)
}

// The desktop renderer supplies its own contextual menus. Without this guard,
// the browser also opens its native page menu for the same right-click, which
// leaves two menus visible at once in the web wrapper. Capture the event so
// the guard runs before renderer handlers, but do not stop propagation: the
// renderer still needs the event to open its custom menu.
if (typeof window !== 'undefined') {
  installMobileViewportBridge()
  installLongPressFallback()

  window.addEventListener('contextmenu', event => {
    event.preventDefault()
  }, true)
}

// HUD is an Electron window mode. The browser wrapper has no separate native
// window for it, so treat stale/bookmarked HUD URLs as the normal app before
// the upstream renderer reads `window.location.search` during module startup.
if (typeof window !== 'undefined') {
  const url = new URL(window.location.href)

  if (url.searchParams.get('win') === 'hud') {
    url.searchParams.delete('win')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }
}

if (typeof window !== 'undefined' && !window.hermesDesktop) {
  window.hermesDesktop = createWebBridge()
}

export {}
