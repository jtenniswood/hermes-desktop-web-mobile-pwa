import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Codicon, ContribWiring, WiredPane, SidebarProvider, ContribRender, ContribBoundary, useContributions, ROUTES_AREA, contributedRoutes, APP_ROUTES, navigateToWorkspacePage, $selectedStoredSessionId, $selectedBot, SessionTileCloseConfirm, BrowserWorkspace, BrowserPanelButton, revealTreePane, $profiles, $activeGatewayProfile, $showAllProfiles, ALL_PROFILES, CreateProfileDialog, refreshProfiles, runImportProfileFlow, selectProfile, setShowAllProfiles, $layoutTree, findGroupOfPane } from '../upstream/comparison-api'
import { ExperienceSelector } from './selector'
import { runtimeConfig } from '../platform/runtime'

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
  const main = useRef<HTMLElement>(null), menu = useRef<HTMLButtonElement>(null), drawer = useRef<HTMLElement>(null)
  const requestedProfile = useRef<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createProfileOpen, setCreateProfileOpen] = useState(false)
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
  const surface = (pane: typeof bots) => pane?.render ? <ContribBoundary id={pane.id}><ContribRender render={pane.render} /></ContribBoundary> : null
  const openRoute = (path: string) => { navigateToWorkspacePage(navigate, path); setDrawerOpen(false) }
  const profileValue = showAllProfiles ? ALL_PROFILES : profile
  const chooseProfile = (value: string) => {
    if (value === PROFILE_ACTIONS.new) {
      setCreateProfileOpen(true)
      return
    }
    if (value === PROFILE_ACTIONS.import) {
      void runImportProfileFlow()
      return
    }
    if (value === PROFILE_ACTIONS.manage) {
      openRoute('/profiles')
      return
    }
    if (value === ALL_PROFILES) {
      requestedProfile.current = null
      setShowAllProfiles(true)
      return
    }
    requestedProfile.current = value
    selectProfile(value)
  }
  return <div className="browser-shell" data-browser-shell="">
    <header className="browser-header">
      <button className="browser-menu" ref={menu} aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="browser-navigation" onClick={() => setDrawerOpen(open => !open)}>☰</button>
      <a className="browser-brand" href="#/" onClick={() => revealTreePane('workspace')}><img src="/hermes.png" alt="" /><span>Hermes<small>{runtimeConfig().gateway.name}</small></span></a>
      <div className="browser-header-end"><ExperienceSelector /><div id="browser-actions" className="browser-actions" /></div>
    </header>
    <div className="browser-workspace">
      {drawerOpen && <button className="browser-scrim" aria-label="Close navigation" onClick={() => { setDrawerOpen(false); menu.current?.focus() }} />}
      <aside id="browser-navigation" ref={drawer} className={`browser-navigation ${drawerOpen ? 'is-open' : ''}`} aria-label="Sessions, Bots and tools">
        <div className="browser-navigation-tabs" role="tablist" aria-label="Navigation">
          {(['sessions', 'bots', 'tools'] as const).map((value, index, values) => <button key={value} role="tab" tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? values[(index + 1) % values.length] : event.key === 'ArrowLeft' ? values[(index + values.length - 1) % values.length] : null
            if (next) { event.preventDefault(); event.stopPropagation(); setTab(next); (event.currentTarget.parentElement?.children[values.indexOf(next)] as HTMLElement)?.focus() }
          }} onClick={() => setTab(value)}>{value === 'sessions' ? 'Sessions' : value === 'bots' ? 'Bots' : 'Tools'}</button>)}
        </div>
        {tab === 'sessions' && <label className="browser-profile">Profile<select aria-label="Profile" value={profileValue} onChange={event => chooseProfile(event.target.value)}>{!showAllProfiles && !profiles.some(item => item.name === profile) && <option value={profile}>{profile}</option>}{profiles.map(item => <option key={item.name} value={item.name}>{item.display_name || item.name}</option>)}{profiles.length > 1 && <option value={ALL_PROFILES}>All</option>}<optgroup label="Profile actions"><option value={PROFILE_ACTIONS.new}>New profile</option><option value={PROFILE_ACTIONS.import}>Import profile</option><option value={PROFILE_ACTIONS.manage}>Manage profiles</option></optgroup></select></label>}
        <div className="browser-navigation-body" role="tabpanel" aria-label={tab}>
          <div hidden={tab !== 'sessions'} className="browser-pane"><WiredPane part="sidebar" /></div>
          <div hidden={tab !== 'bots'} className="browser-pane">{surface(bots) || <p className="browser-empty">Loading Bots…</p>}</div>
          {tab === 'tools' && <nav className="browser-tools" aria-label="Tools">
            <p>Contributed panels</p>{panes.filter(pane => !['workspace', 'sessions', 'hermes-bots:pane', 'terminal'].includes(pane.id)).map(pane => { const title = String(pane.title || pane.id); return <BrowserPanelButton key={pane.id} id={pane.id} title={sentenceCase(title)} ariaLabel={title} icon={<Codicon name="files" size="1rem" />} collapsible={Boolean((pane.data as { collapsible?: boolean } | undefined)?.collapsible)} onOpen={() => { setDrawerOpen(false); main.current?.focus() }} /> })}
            <p>Tools</p><button className="browser-tool-row" aria-label="settings" aria-current={location.pathname === '/settings' ? 'page' : undefined} onClick={() => openRoute('/settings')}><span className="browser-tool-icon"><Codicon name="settings-gear" size="1rem" /></span><span>Settings</span></button>{APP_ROUTES.filter(route => TOOLS_ROUTE_IDS.has(route.id)).map(route => <button className="browser-tool-row" key={route.path} aria-label={route.id} aria-current={location.pathname === route.path ? 'page' : undefined} onClick={() => openRoute(route.path)}><span className="browser-tool-icon"><Codicon name={toolRouteIcon(route.id)} size="1rem" /></span><span>{toolRouteLabel(route.id)}</span></button>)}
            <p>Workspace</p>{APP_ROUTES.filter(route => !['new', 'settings', 'session-import', 'cron', ...TOOLS_ROUTE_IDS].includes(route.id)).map(route => <button className="browser-tool-row" key={route.path} aria-label={route.id.replaceAll('-', ' ')} aria-current={location.pathname === route.path ? 'page' : undefined} onClick={() => openRoute(route.path)}><span className="browser-tool-icon"><Codicon name={toolRouteIcon(route.id)} size="1rem" /></span><span>{sentenceCase(route.id)}</span></button>)}
            {!!routes.length && <p>Extensions</p>}{routes.map(route => <button className="browser-tool-row" key={route.key} aria-current={location.pathname === route.path ? 'page' : undefined} onClick={() => openRoute(route.path)}><span className="browser-tool-icon"><Codicon name="folder" size="1rem" /></span><span>{sentenceCase(route.path.slice(1))}</span></button>)}
          </nav>}
        </div>
      </aside>
      <main className="browser-main" ref={main} tabIndex={-1} aria-label="Conversation and workspace">
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
