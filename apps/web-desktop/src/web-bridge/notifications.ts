import { pwaRegistration } from '../pwa/register'

// Kept structural so this web-only module also typechecks against renderer
// revisions whose global declaration does not re-export the Electron type.
type HermesNotification = {
  actions?: Array<{ id: string; text: string; activate?: string }>
  activate?: string
  body?: string
  focusSessionId?: string
  icon?: string
  kind?: string
  notifyId?: string
  sessionId?: string
  silent?: boolean
  tag?: string
  title?: string
}

const READY_TIMEOUT_MS = 1_500
const GESTURE_WINDOW_MS = 2_000
const NOTIFICATION_VERSION = 1

export type NotificationActivation = {
  actionId?: string
  activate?: string
  eventId?: string
  focusSessionId?: string
  notifyId?: string
  sessionId?: string
  tag?: string
}

type NotificationListener<T> = (payload: T) => void

export type WebNotificationRuntime = {
  notify: (payload: HermesNotification) => Promise<boolean>
  onFocusSession: (callback: NotificationListener<string>) => () => void
  onNotificationAction: (callback: NotificationListener<{ actionId: string; sessionId?: string }>) => () => void
  onNotificationActivate: (callback: NotificationListener<NotificationActivation>) => () => void
}

type SerializedNotification = NotificationActivation & {
  actions?: Array<{ action: string; title: string; activate?: string }>
  body?: string
  eventId: string
  kind?: string
  silent?: boolean
  title: string
  url: string
  version: number
}

const listeners = {
  action: new Set<NotificationListener<{ actionId: string; sessionId?: string }>>(),
  activate: new Set<NotificationListener<NotificationActivation>>(),
  focus: new Set<NotificationListener<string>>()
}

let lastUserGestureAt = 0
let messageListenerInstalled = false
let eventCounter = 0
const pendingActivations: NotificationActivation[] = []

function remove<T>(set: Set<NotificationListener<T>>, callback: NotificationListener<T>): () => void {
  set.add(callback)
  flushPendingActivations()
  return () => set.delete(callback)
}

function emit<T>(set: Set<NotificationListener<T>>, payload: T): void {
  for (const callback of set) {
    try {
      callback(payload)
    } catch {
      // One renderer integration must not prevent another from receiving a click.
    }
  }
}

function markUserGesture(): void {
  lastUserGestureAt = Date.now()
}

function canRequestPermission(): boolean {
  return Date.now() - lastUserGestureAt <= GESTURE_WINDOW_MS
}

function appUrl(): string {
  const current = new URL(window.location.href)
  // Keep the hash-router destination so the worker can select the originating
  // tab, while deliberately dropping query parameters (which may contain
  // gateway tickets or other transient credentials).
  return current.origin + current.pathname + current.hash
}

function eventId(payload: HermesNotification): string {
  if (payload.notifyId) return payload.notifyId
  eventCounter += 1
  return [payload.kind ?? 'notification', payload.sessionId ?? payload.tag ?? 'global', Date.now(), eventCounter].join(':')
}

function duplicateKey(payload: SerializedNotification): string {
  return `hermes-notification:${payload.kind ?? 'notification'}:${payload.sessionId ?? payload.tag ?? 'global'}`
}

function isDuplicate(payload: SerializedNotification): boolean {
  const key = duplicateKey(payload)
  const now = Date.now()
  try {
    const previous = Number.parseInt(localStorage.getItem(key) ?? '', 10)
    if (Number.isFinite(previous) && now - previous < 1_000) return true
    localStorage.setItem(key, String(now))
  } catch {
    // Storage can be disabled in private browsing; the in-memory path still works.
  }
  return false
}

function safePath(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.startsWith('/')) return value
  if (value.startsWith('#/')) return value
  return undefined
}

function serialize(payload: HermesNotification): SerializedNotification {
  const id = eventId(payload)
  const activate = safePath(payload.activate)
  const actions = Array.isArray(payload.actions)
    ? payload.actions.slice(0, 2).map(action => ({
        action: String(action.id),
        activate: safePath(action.activate),
        title: String(action.text)
      }))
    : undefined

  return {
    actions,
    activate,
    body: payload.body,
    eventId: id,
    focusSessionId: payload.focusSessionId,
    kind: payload.kind,
    notifyId: payload.notifyId,
    sessionId: payload.sessionId,
    silent: payload.silent,
    tag: payload.tag,
    title: payload.title ?? 'Hermes',
    url: appUrl(),
    version: NOTIFICATION_VERSION
  }
}

function dispatchActivation(payload: NotificationActivation): void {
  const needsFocus = Boolean(payload.focusSessionId || payload.sessionId)
  const isAction = Boolean(payload.actionId && payload.sessionId && !payload.activate && !payload.notifyId)
  const needsActivate = !isAction && Boolean(payload.activate || payload.notifyId)
  if (
    (needsFocus && listeners.focus.size === 0) ||
    (isAction && listeners.action.size === 0) ||
    (needsActivate && listeners.activate.size === 0)
  ) {
    if (pendingActivations.length < 20) pendingActivations.push(payload)
    return
  }
  if (payload.focusSessionId) emit(listeners.focus, payload.focusSessionId)
  else if (payload.sessionId) emit(listeners.focus, payload.sessionId)

  if (payload.actionId && payload.sessionId && !payload.activate && !payload.notifyId) {
    emit(listeners.action, { actionId: payload.actionId, sessionId: payload.sessionId })
  } else if (payload.activate || payload.notifyId) {
    emit(listeners.activate, payload)
  }
}

function flushPendingActivations(): void {
  if (listeners.focus.size === 0 && listeners.action.size === 0 && listeners.activate.size === 0) return
  const pending = pendingActivations.splice(0)
  for (const payload of pending) dispatchActivation(payload)
}

function installMessageListener(): void {
  if (messageListenerInstalled || !('serviceWorker' in navigator)) return
  messageListenerInstalled = true

  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data
    if (!data || data.type !== 'hermes-notification-activation') return
    dispatchActivation(data.payload as NotificationActivation)
  })

}

function consumeColdStartActivation(): NotificationActivation | null {
  try {
    const url = new URL(window.location.href)
    const encoded = url.searchParams.get('hermes_notification')
    if (!encoded) return null
    url.searchParams.delete('hermes_notification')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    return JSON.parse(encoded) as NotificationActivation
  } catch {
    return null
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await Promise.race([
      pwaRegistration().then(result => result ?? navigator.serviceWorker.ready),
      new Promise<null>(resolve => window.setTimeout(() => resolve(null), READY_TIMEOUT_MS))
    ])
  } catch {
    return null
  }
}

export function requestWebNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return Promise.resolve('unsupported')
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission)
  if (!canRequestPermission()) return Promise.resolve('default')
  return Notification.requestPermission().catch(() => 'denied')
}

export function createWebNotificationRuntime(): WebNotificationRuntime {
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', markUserGesture, true)
    window.addEventListener('keydown', markUserGesture, true)
    window.addEventListener('click', markUserGesture, true)
  }
  installMessageListener()
  const coldStartActivation = consumeColdStartActivation()
  if (coldStartActivation) {
    // Let the renderer register its listeners before replaying a cold-start
    // click. A second task also gives the router a chance to restore auth.
    window.setTimeout(() => dispatchActivation(coldStartActivation), 0)
  }

  const notify = async (payload: HermesNotification): Promise<boolean> => {
    if (!('Notification' in window)) return false

    const permission = await requestWebNotificationPermission()
    if (permission !== 'granted') return false

    const serialized = serialize(payload)
    if (isDuplicate(serialized)) return true
    const options = {
      badge: new URL('/hermes.png', window.location.origin).toString(),
      body: serialized.body,
      data: serialized,
      icon: new URL('/hermes.png', window.location.origin).toString(),
      renotify: true,
      silent: serialized.silent,
      tag: `hermes:${serialized.kind ?? 'notification'}:${serialized.tag ?? serialized.sessionId ?? serialized.eventId}`
    } as NotificationOptions & { actions?: Array<{ action: string; title: string }>; renotify?: boolean }

    const registration = await readyRegistration()
    if (registration) {
      try {
        const workerOptions = { ...options, actions: serialized.actions } as unknown as NotificationOptions
        await registration.showNotification(serialized.title, workerOptions)
        return true
      } catch {
        // Fall back for browsers with a broken or incompatible worker.
      }
    }

    try {
      const notification = new Notification(serialized.title, options)
      notification.onclick = () => {
        dispatchActivation(serialized)
        notification.close()
        window.focus()
      }
      return true
    } catch {
      return false
    }
  }

  return {
    notify,
    onFocusSession: callback => remove(listeners.focus, callback),
    onNotificationAction: callback => remove(listeners.action, callback),
    onNotificationActivate: callback => remove(listeners.activate, callback)
  }
}
