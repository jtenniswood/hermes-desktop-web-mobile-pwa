import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Codicon, ContribWiring, WiredPane, SidebarProvider, ContribRender, ContribBoundary, useContributions, ROUTES_AREA, contributedRoutes, APP_ROUTES, navigateToWorkspacePage, $selectedStoredSessionId, $selectedBot, SessionTileCloseConfirm, BrowserWorkspace, BrowserPanelButton, revealTreePane, $profiles, $activeGatewayProfile, $showAllProfiles, ALL_PROFILES, CreateProfileDialog, refreshProfiles, runImportProfileFlow, selectProfile, setShowAllProfiles, $layoutTree, findGroupOfPane } from '../upstream/comparison-api'
import { ExperienceSelector } from './selector'
import { runtimeConfig } from '../platform/runtime'
import { currentPwaUpdate, subscribePwaUpdate, type PwaUpdateNotice } from '../pwa/register'

const TOOL_ROUTE_META: Record<string, { label: string; icon: string }> = {
  'command-center': { label: 'Command center', icon: 'symbol-misc' },
  skills: { label: 'Capabilities', icon: 'symbol-misc' },
  messaging: { label: 'Messaging', icon: 'comment' },
  webhooks: { label: 'Webhooks', icon: 'globe' },
  artifacts: { label: 'Artifacts', icon: 'files' },
  cron: { label: 'Scheduled jobs', icon: 'watch' },
  profiles: { label: 'Profiles', icon: 'account' },
  agents: { label: 'Agents', icon: 'hubot' },
  starmap: { label: 'Starmap', icon: 'pulse' }
}

const PROFILE_ACTIONS = {
  new: '__new_profile__',
  import: '__import_profile__',
  manage: '__manage_profiles__'
} as const

function toolRouteIcon(id: string) {
  return TOOL_ROUTE_META[id]?.icon || 'folder'
}

function sentenceCase(label: string) {
  const value = label.replaceAll('-', ' ').trim()
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

function toolRouteLabel(id: string) {
  return sentenceCase(TOOL_ROUTE_META[id]?.label || id)
}

const TOOLS_ROUTE_IDS = new Set(['skills', 'messaging', 'artifacts'])
const DEFAULT_NAVIGATION_WIDTH = 304
const MIN_NAVIGATION_WIDTH = 224
const MAX_NAVIGATION_WIDTH = 560

function clampNavigationWidth(width: number) {
  return Math.min(MAX_NAVIGATION_WIDTH, Math.max(MIN_NAVIGATION_WIDTH, width))
}

export function BrowserShell() {
  return <SidebarProvider className="browser-provider" style={{ '--sidebar-width': '100%' } as CSSProperties}>
    <ContribWiring><BrowserLayout /><SessionTileCloseConfirm /></ContribWiring>
  </SidebarProvider>
}
function BrowserLayout() {
  const navigate = useNavigate(), location = useLocation()
  const selected = useStore($selectedStoredSessionId), bot = useStore($selectedBot)
  const profiles = useStore($profiles), profile = useStore($activeGatewayProfile), showAllProfiles = useStore($showAllProfiles)
  const tree = useStore($layoutTree)
  const workspacePane = tree && findGroupOfPane(tree, 'workspace')?.active
  const panes = useContributions('panes')
  const routes = contributedRoutes(useContributions(ROUTES_AREA))
  const main = useRef<HTMLElement>(null), menu = useRef<HTMLButtonElement>(null), drawer = useRef<HTMLElement>(null), profileActions = useRef<HTMLDivElement>(null), profileActionsButton = useRef<HTMLButtonElement>(null)
  const requestedProfile = useRef<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [profileActionsOpen, setProfileActionsOpen] = useState(false)
  const [createProfileOpen, setCreateProfileOpen] = useState(false)
  const [updateNotice, setUpdateNotice] = useState<PwaUpdateNotice | null>(() => currentPwaUpdate())
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [navigationWidth, setNavigationWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('hermes-web.browser.navigation-width'))
      return Number.isFinite(saved) ? clampNavigationWidth(saved) : DEFAULT_NAVIGATION_WIDTH
    } catch { return DEFAULT_NAVIGATION_WIDTH }
  })
  const navigationResize = useRef<{ startX: number; startWidth: number } | null>(null)
  const [tab, setTab] = useState<'sessions' | 'bots' | 'tools'>(() => {
    try { const saved = localStorage.getItem('hermes-web.browser.navigation'); return saved === 'bots' || saved === 'tools' ? saved : 'sessions' } catch { return 'sessions' }
  })
  const bots = panes.find(pane => pane.id === 'hermes-bots:pane')
  const previous = useRef({ selected, bot, path: location.pathname })
  useEffect(() => {
    setDrawerOpen(false)
    if (drawerOpen) requestAnimationFrame(() => main.current?.focus())
  }, [workspacePane])
  useEffect(() => {
    if (previous.current.selected !== selected || previous.current.bot !== bot || previous.current.path !== location.pathname) {
      setDrawerOpen(false); revealTreePane('workspace')
      if (drawerOpen) requestAnimationFrame(() => main.current?.focus())
    }
    previous.current = { selected, bot, path: location.pathname }
  }, [selected, bot, location.pathname])
  useEffect(() => { try { localStorage.setItem('hermes-web.browser.navigation', tab) } catch { /* Optional preference. */ } }, [tab])
  useEffect(() => { try { localStorage.setItem('hermes-web.browser.navigation-width', String(navigationWidth)) } catch { /* Optional preference. */ } }, [navigationWidth])
  useEffect(() => { if (tab !== 'sessions') setProfileActionsOpen(false) }, [tab])
  useEffect(() => subscribePwaUpdate(notice => {
    setUpdateNotice(notice)
    if (notice) setUpdateDismissed(false)
  }), [])
  useEffect(() => {
    // A Bot activation can finish after a profile pick and restore the
    // upstream all-profiles flag. Keep an explicit browser selection in force.
    if (requestedProfile.current === profile && showAllProfiles) setShowAllProfiles(false)
  }, [profile, showAllProfiles])
  useEffect(() => {
    if (!drawerOpen) return
    drawer.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setDrawerOpen(false); menu.current?.focus() }
      if (event.key !== 'Tab') return
      const items = Array.from(drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]') || []).filter(el => el.getClientRects().length)
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [drawerOpen])
  useEffect(() => {
    if (!profileActionsOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!profileActions.current?.contains(event.target as Node)) setProfileActionsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    requestAnimationFrame(() => profileActions.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus())
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [profileActionsOpen])
  const surface = (pane: typeof bots) => pane?.render ? <ContribBoundary id={pane.id}><ContribRender render={pane.render} /></ContribBoundary> : null
  const openRoute = (path: string) => { navigateToWorkspacePage(navigate, path); setDrawerOpen(false) }
  const profileValue = showAllProfiles ? ALL_PROFILES : profile
  const chooseProfile = (value: string) => {
    if (value === ALL_PROFILES) {
      requestedProfile.current = null
      // The session-list adapter uses this marker to route concrete profile
      // refreshes through the shared browser connection. Clear it explicitly
      // so the upstream ALL_PROFILES scope can request the combined view.
      window.__HERMES_WEB_ACTIVE_PROFILE__ = null
      setShowAllProfiles(true)
      return
    }
    requestedProfile.current = value
    selectProfile(value)
  }
  const profileAction = (action: typeof PROFILE_ACTIONS[keyof typeof PROFILE_ACTIONS]) => {
    setProfileActionsOpen(false)
    if (action === PROFILE_ACTIONS.new) setCreateProfileOpen(true)
    if (action === PROFILE_ACTIONS.import) void runImportProfileFlow()
    if (action === PROFILE_ACTIONS.manage) openRoute('/profiles')
  }
  const beginNavigationResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    navigationResize.current = { startX: event.clientX, startWidth: navigationWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const updateNavigationResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = navigationResize.current
    if (start) setNavigationWidth(clampNavigationWidth(start.startWidth + event.clientX - start.startX))
  }
  const endNavigationResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    navigationResize.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const nudgeNavigationWidth = (delta: number) => setNavigationWidth(width => clampNavigationWidth(width + delta))
  return <div className="browser-shell" data-browser-shell="">
    <header className="browser-header">
      <button className="browser-menu" ref={menu} aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="browser-navigation" onClick={() => setDrawerOpen(open => !open)}>☰</button>
      <a className="browser-brand" href="#/" onClick={() => revealTreePane('workspace')}><span>Hermes<small>{runtimeConfig().gateway.name}</small></span></a>
      <div className="browser-header-end"><ExperienceSelector /></div>
    </header>
    <div className="browser-workspace">
      {drawerOpen && <button className="browser-scrim" aria-label="Close navigation" onClick={() => { setDrawerOpen(false); menu.current?.focus() }} />}
      <aside id="browser-navigation" ref={drawer} className={`browser-navigation ${drawerOpen ? 'is-open' : ''}`} aria-label="Sessions, Bots and tools" style={{ '--browser-navigation-width': `${navigationWidth}px` } as CSSProperties}>
        <div className="browser-navigation-tabs" role="tablist" aria-label="Navigation">
          {(['sessions', 'bots', 'tools'] as const).map((value, index, values) => <button key={value} role="tab" tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? values[(index + 1) % values.length] : event.key === 'ArrowLeft' ? values[(index + values.length - 1) % values.length] : null
            if (next) { event.preventDefault(); event.stopPropagation(); setTab(next); (event.currentTarget.parentElement?.children[values.indexOf(next)] as HTMLElement)?.focus() }
          }} onClick={() => setTab(value)}>{value === 'sessions' ? 'Sessions' : value === 'bots' ? 'Bots' : 'Tools'}</button>)}
        </div>
        <div className="browser-navigation-body" role="tabpanel" aria-label={tab}>
          <div hidden={tab !== 'sessions'} className="browser-pane browser-sessions-pane"><WiredPane part="sidebar" /></div>
          <div hidden={tab !== 'bots'} className="browser-pane">{surface(bots) || <p className="browser-empty">Loading Bots…</p>}</div>
          {tab === 'tools' && <nav className="browser-tools" aria-label="Tools">
            <p>Panels</p>{panes.filter(pane => !['workspace', 'sessions', 'hermes-bots:pane', 'terminal'].includes(pane.id)).map(pane => { const title = String(pane.title || pane.id); return <BrowserPanelButton key={pane.id} id={pane.id} title={sentenceCase(title)} ariaLabel={title} icon={<Codicon name="files" size="1rem" />} collapsible={Boolean((pane.data as { collapsible?: boolean } | undefined)?.collapsible)} onOpen={() => { setDrawerOpen(false); main.current?.focus() }} /> })}
            <p>System</p><button className="browser-tool-row" aria-label="settings" aria-current={location.pathname === '/settings' ? 'page' : undefined} onClick={() => openRoute('/settings')}><span className="browser-tool-icon"><Codicon name="settings-gear" size="1rem" /></span><span>Settings</span></button>{APP_ROUTES.filter(route => TOOLS_ROUTE_IDS.has(route.id)).map(route => <button className="browser-tool-row" key={route.path} aria-label={route.id} aria-current={location.pathname === route.path ? 'page' : undefined} onClick={() => openRoute(route.path)}><span className="browser-tool-icon"><Codicon name={toolRouteIcon(route.id)} size="1rem" /></span><span>{toolRouteLabel(route.id)}</span></button>)}
            <p>Workspace</p>{APP_ROUTES.filter(route => !['new', 'settings', 'session-import', 'cron', ...TOOLS_ROUTE_IDS].includes(route.id)).map(route => <button className="browser-tool-row" key={route.path} aria-label={route.id.replaceAll('-', ' ')} aria-current={location.pathname === route.path ? 'page' : undefined} onClick={() => openRoute(route.path)}><span className="browser-tool-icon"><Codicon name={toolRouteIcon(route.id)} size="1rem" /></span><span>{sentenceCase(route.id)}</span></button>)}
            {!!routes.length && <p>Extensions</p>}{routes.map(route => <button className="browser-tool-row" key={route.key} aria-current={location.pathname === route.path ? 'page' : undefined} onClick={() => openRoute(route.path)}><span className="browser-tool-icon"><Codicon name="folder" size="1rem" /></span><span>{sentenceCase(route.path.slice(1))}</span></button>)}
          </nav>}
        </div>
        {updateNotice && !updateDismissed && <div className="browser-update-panel" role="status" aria-label="Application update">
          <div className="browser-update-panel-heading"><strong>Update available</strong><button type="button" aria-label="Dismiss update" onClick={() => setUpdateDismissed(true)}>×</button></div>
          <p>{updateNotice.message}</p>
          <button type="button" className="browser-update-panel-action" onClick={updateNotice.update}>Update when safe</button>
        </div>}
        {tab === 'sessions' && <div className="browser-profile-footer">
          <select aria-label="Profile" value={profileValue} onChange={event => chooseProfile(event.target.value)}>{profiles.length > 1 && <option value={ALL_PROFILES}>All</option>}{!showAllProfiles && !profiles.some(item => item.name === profile) && <option value={profile}>{sentenceCase(profile)}</option>}{profiles.map(item => <option key={item.name} value={item.name}>{sentenceCase(item.display_name || item.name)}</option>)}</select>
          <div className="browser-profile-actions" ref={profileActions} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setProfileActionsOpen(false); profileActionsButton.current?.focus() } }}>
            <button className="browser-profile-actions-trigger" ref={profileActionsButton} type="button" aria-label="Profile actions" aria-haspopup="menu" aria-expanded={profileActionsOpen} onClick={() => setProfileActionsOpen(open => !open)}><Codicon name="kebab-vertical" size="1rem" /></button>
            {profileActionsOpen && <div className="browser-profile-actions-menu" role="menu" aria-label="Profile actions">
              <button type="button" role="menuitem" onClick={() => profileAction(PROFILE_ACTIONS.new)}>New profile</button>
              <button type="button" role="menuitem" onClick={() => profileAction(PROFILE_ACTIONS.import)}>Import profile</button>
              <button type="button" role="menuitem" onClick={() => profileAction(PROFILE_ACTIONS.manage)}>Manage profiles</button>
            </div>}
          </div>
        </div>}
      </aside>
      <div className="browser-navigation-resizer" role="separator" tabIndex={0} aria-label="Resize navigation panel" aria-orientation="vertical" aria-valuemin={MIN_NAVIGATION_WIDTH} aria-valuemax={MAX_NAVIGATION_WIDTH} aria-valuenow={Math.round(navigationWidth)} onPointerDown={beginNavigationResize} onPointerMove={updateNavigationResize} onPointerUp={endNavigationResize} onPointerCancel={endNavigationResize} onDoubleClick={() => setNavigationWidth(DEFAULT_NAVIGATION_WIDTH)} onKeyDown={event => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeNavigationWidth(-16) }
        if (event.key === 'ArrowRight') { event.preventDefault(); nudgeNavigationWidth(16) }
        if (event.key === 'Home') { event.preventDefault(); setNavigationWidth(MIN_NAVIGATION_WIDTH) }
        if (event.key === 'End') { event.preventDefault(); setNavigationWidth(MAX_NAVIGATION_WIDTH) }
      }} />
      <main className="browser-main" ref={main} tabIndex={-1} aria-label="Conversation and workspace">
        <div className="browser-chat-toolbar" aria-label="Chat controls"><div className="browser-actions"><button type="button" aria-label="Open settings" title="Settings" onClick={() => openRoute('/settings')}><Codicon name="settings-gear" size="1rem" /></button></div></div>
        <BrowserWorkspace />
        <div className="browser-status"><WiredPane part="statusbar" /></div>
      </main>
      <CreateProfileDialog
        onClose={() => setCreateProfileOpen(false)}
        onCreated={async name => {
          await refreshProfiles()
          selectProfile(name)
        }}
        open={createProfileOpen}
        profiles={profiles}
      />
    </div>
  </div>
}
