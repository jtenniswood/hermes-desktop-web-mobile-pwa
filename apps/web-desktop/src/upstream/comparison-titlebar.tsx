import { useEffect, useState, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { TitlebarControls as DesktopTitlebar } from '../../../desktop/src/app/shell/titlebar-controls'
import { Slot } from '@/contrib/react/slot'
import { currentExperience } from '../experience/selection'
export function TitlebarControls(props: ComponentProps<typeof DesktopTitlebar>) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const navigate = useNavigate()
  useEffect(() => { setHost(document.getElementById('browser-actions')) }, [])
  if (currentExperience() === 'desktop') return <DesktopTitlebar {...props} />
  if (!host) return null
  const browserTools = [...(props.leftTools || []), ...(props.tools || [])].filter(tool => !tool.hidden && tool.id === 'settings')
  return createPortal(<>
    <Slot area="titleBar.left" />
    {browserTools.map(tool =>
      <button key={tool.id} data-tour={tool.tour} disabled={tool.disabled} aria-label={tool.label} title={tool.title || tool.label} aria-pressed={tool.active} onClick={event => {
        if (tool.href) window.open(tool.href, '_blank', 'noopener,noreferrer')
        else {
          if (tool.to) navigate(tool.to)
          tool.onSelect?.(event)
        }
      }}>{tool.icon}{!!tool.badge && <span className="browser-action-badge">{tool.badge}</span>}</button>)}
    <Slot area="titleBar.center" />
    <Slot area="titleBar.right" />
  </>, host)
}
