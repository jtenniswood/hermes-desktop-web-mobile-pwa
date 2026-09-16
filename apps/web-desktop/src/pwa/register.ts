// PWA service-worker registration (vite-plugin-pwa with injectRegister: null,
// so we register ourselves). Only registers on HTTPS (or localhost) — service
// workers are unavailable on plain http, which is why the Tailscale HTTPS URL
// (hermes-web.emu-nessie.ts.net) is the PWA entry point.
let registration: Promise<ServiceWorkerRegistration | null> = Promise.resolve(null)

/** Resolves when the app's worker is ready, without throwing on unsupported
 * browsers or development servers. Notification delivery uses this to avoid
 * racing worker installation. */
export function pwaRegistration(): Promise<ServiceWorkerRegistration | null> {
  return registration
}

export function registerPwa(): void {
  if (!('serviceWorker' in navigator)) {
    return
  }

  const { hostname, protocol } = window.location
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')

  if (protocol !== 'https:' && !isLocalhost) {
    return
  }

  const register = (): void => {
    registration = navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).toString())
      .catch(() => null)
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
