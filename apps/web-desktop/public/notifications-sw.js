// Extra service-worker behavior for notifications. vite-plugin-pwa imports
// this file into its generated Workbox service worker.
self.addEventListener('notificationclick', event => {
  const notification = event.notification
  const targetUrl = notification.data?.url ?? self.location.origin + '/'

  notification.close()
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    for (const client of clients) {
      if ('focus' in client) {
        await client.focus()

        if ('navigate' in client && client.url !== targetUrl) {
          await client.navigate(targetUrl)
        }

        return
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl)
    }
  })())
})
