import type { ComponentProps } from 'react'
import { useNavigate } from 'react-router'
import { StatusbarItemView } from 'hermes:statusbar-item'
import { StatusbarControls as DesktopStatusbar } from '../../../desktop/src/app/shell/statusbar-controls'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { currentExperience } from '../experience/selection'

/** Browser chrome groups the existing wired controls; upstream still owns
 * menus, callbacks, plugin renderers, status polling and permission changes. */
export function StatusbarControls(props: ComponentProps<typeof DesktopStatusbar>) {
  const navigate = useNavigate()
  if (currentExperience() === 'desktop') return <DesktopStatusbar {...props} />
  const items = [...(props.leftItems || []), ...(props.items || [])].filter(item => !item.hidden && !['terminal', 'gateway-switcher', 'profile-switcher'].includes(item.id))
  const primaryIds = new Set(['gateway-health', 'approval-mode', 'running-timer'])
  const versions = items.filter(item => item.id === 'version-client' || item.id === 'version-backend')
  const updateAvailable = versions.some(item => item.className?.includes('text-primary'))
  const primary = items.filter(item => primaryIds.has(item.id))
  const details = items.filter(item => !primaryIds.has(item.id)).map(item => ({
    ...item,
    // Give the desktop's icon-only command button a readable browser label.
    label: item.id === 'command-center' ? 'Command center' : item.label
  }))
  const versionIds = new Set(['version-client', 'version-backend'])
  const sessionIds = new Set(['context-usage', 'cache-hit-rate', 'tokens-per-second', 'session-timer', 'system-resources'])
  const groups = [
    { title: 'Workspace & tools', items: details.filter(item => !versionIds.has(item.id) && !sessionIds.has(item.id)) },
    { title: 'Session', items: details.filter(item => sessionIds.has(item.id)) },
    { title: 'Versions', items: details.filter(item => versionIds.has(item.id)) }
  ]
  return <div className="browser-statusbar" role="region" aria-label="Gateway and session status">
    <div className="browser-status-controls">{primary.map(item => <StatusbarItemView key={item.id} item={item} navigate={navigate} />)}</div>
    <Popover>
      <PopoverTrigger asChild>
        <button className="browser-status-details" aria-label="Connection and session details">
          {updateAvailable && <span className="browser-update-dot" aria-label="Update available" />}
          Details <span aria-hidden="true">⌃</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="browser-status-popover" aria-label="Connection and session details" align="end" side="top">
        <h2>Connection &amp; session</h2>
        <p>Workspace controls and version information</p>
        {groups.filter(group => group.items.length).map(group => <section key={group.title} className="browser-status-section" aria-label={group.title}>
          <h3>{group.title}</h3>
          <div className="browser-status-detail-controls">{group.items.map(item => <StatusbarItemView key={item.id} item={item} navigate={navigate} />)}</div>
        </section>)}
      </PopoverContent>
    </Popover>
  </div>
}
