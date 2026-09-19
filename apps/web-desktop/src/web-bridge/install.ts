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

// The browser shell does not have the desktop renderer's contextual-menu
// handlers, so suppress the browser page menu there. Leave desktop events
// untouched: its profile bar, status bar, and layout controls own the
// context-menu event and need to receive it before the default is cancelled.
if (typeof window !== 'undefined') {
  window.addEventListener('contextmenu', event => {
    if (document.documentElement.dataset.experience !== 'desktop') {
      event.preventDefault()
    }
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
