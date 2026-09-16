// Extra service-worker behavior for notifications. vite-plugin-pwa imports
// this file into its generated Workbox service worker.
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {}
    try { data = event.data?.json() ?? {} } catch { return }
    const title = data.title || 'Hermes'
    const actions = Array.isArray(data.actions)
      ? data.actions.slice(0, 2).map(action => ({ action: String(action.action), title: String(action.title) }))
      : undefined
    await self.registration.showNotification(title, {
      actions,
      badge: data.badge || new URL('/hermes.png', self.location.origin).toString(),
      body: data.body,
      data,
      icon: data.icon || new URL('/hermes.png', self.location.origin).toString(),
      renotify: true,
      silent: Boolean(data.silent),
      tag: data.tag || `hermes:${data.eventId || Date.now()}`
    })
  })())
})

self.addEventListener('notificationclick', event => {
  const notification = event.notification
  const data = notification.data ?? {}
  let targetUrl = self.location.origin + '/'
  try {
    const candidate = new URL(data.url || targetUrl)
    if (candidate.origin === self.location.origin) targetUrl = candidate.toString()
  } catch {}
  const selectedAction = Array.isArray(data.actions)
    ? data.actions.find(action => action.action === event.action)
    : undefined
  const payload = {
    actionId: event.action || undefined,
    activate: selectedAction?.activate ?? data.activate,
    eventId: data.eventId,
    focusSessionId: data.focusSessionId,
    notifyId: data.notifyId,
    sessionId: data.sessionId,
    tag: data.tag
  }

  notification.close()
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    // Prefer the tab that created the notification. This avoids sending a
    // session-focus event to an unrelated profile when several tabs are open.
    const owner = clients.find(client => client.url === targetUrl) ?? clients.find(client => {
      try {
        const clientUrl = new URL(client.url)
        const destination = new URL(targetUrl)
        return clientUrl.origin === destination.origin && clientUrl.pathname === destination.pathname
      } catch { return false }
    })

    if (owner) {
      await owner.focus()
      owner.postMessage({ type: 'hermes-notification-activation', payload })
      return
    }

    if (self.clients.openWindow) {
      // Carry only the sanitized notification envelope through the cold-start
      // URL. The app consumes and removes this parameter before rendering.
      const encoded = JSON.stringify(payload)
      const destination = new URL(targetUrl)
      destination.searchParams.set('hermes_notification', encoded)
      await self.clients.openWindow(destination.toString())
    }
  })())
})
