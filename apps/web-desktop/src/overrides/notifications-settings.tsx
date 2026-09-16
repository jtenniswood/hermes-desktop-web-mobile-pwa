import { useCallback, useEffect, useState } from 'react'

import { NotificationsSettings as UpstreamNotificationsSettings } from '../../../desktop/src/app/settings/notifications-settings'

import { requestWebNotificationPermission } from '../web-bridge/notifications'

function BrowserNotificationControls() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')

  const refresh = useCallback(() => {
    setPermission('Notification' in window ? Notification.permission : 'unsupported')
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  const enable = async () => {
    // This call is intentionally the first asynchronous operation in the
    // click handler. Browsers require permission prompts to follow a gesture.
    const result = await requestWebNotificationPermission()
    setPermission(result)
  }

  let state = 'Not enabled'
  if (permission === 'granted') state = 'Enabled'
  else if (permission === 'denied') state = 'Blocked by browser'
  else if (permission === 'unsupported') state = 'Not supported by this browser'

  return (
    <section className="mb-4 rounded-lg border border-(--ui-border) bg-(--ui-bg-secondary) p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Browser notifications</p>
          <p className="text-xs text-(--ui-text-tertiary)">
            Status: {state}. On iOS, add Hermes to the Home Screen first.
          </p>
        </div>
        {permission !== 'granted' && permission !== 'unsupported' && (
          <button
            className="rounded-md border border-(--ui-border) px-3 py-1.5 text-sm hover:bg-(--ui-bg-tertiary)"
            onClick={() => void enable()}
            type="button"
          >
            {permission === 'denied' ? 'Review browser permission' : 'Enable browser notifications'}
          </button>
        )}
      </div>
    </section>
  )
}

export function NotificationsSettings() {
  return (
    <>
      <BrowserNotificationControls />
      <UpstreamNotificationsSettings />
    </>
  )
}
