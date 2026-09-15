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

// The desktop renderer supplies its own contextual menus. Without this guard,
// the browser also opens its native page menu for the same right-click, which
// leaves two menus visible at once in the web wrapper. Capture the event so
// the guard runs before renderer handlers, but do not stop propagation: the
// renderer still needs the event to open its custom menu.
if (typeof window !== 'undefined') {
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
