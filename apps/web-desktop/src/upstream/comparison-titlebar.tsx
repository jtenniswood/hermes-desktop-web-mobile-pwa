import type { ComponentProps } from 'react'
import { TitlebarControls as DesktopTitlebar } from '../../../desktop/src/app/shell/titlebar-controls'
import { currentExperience } from '../experience/selection'

/** Browser chrome owns its single Settings control; desktop keeps upstream controls. */
export function TitlebarControls(props: ComponentProps<typeof DesktopTitlebar>) {
  if (currentExperience() === 'desktop') return <DesktopTitlebar {...props} />
  return null
}
