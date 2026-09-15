import {
  $titlebarAppActionsSide,
  setTitlebarAppActionsSide as setUpstreamTitlebarAppActionsSide,
  titlebarAppActionsClusterCounts as upstreamTitlebarAppActionsClusterCounts,
  TITLEBAR_APP_ACTIONS_DEFAULT
} from '../../../desktop/src/store/titlebar-app-actions'

export { $titlebarAppActionsSide, TITLEBAR_APP_ACTIONS_DEFAULT }
export type { TitlebarAppActionsSide } from '../../../desktop/src/store/titlebar-app-actions'

export function setTitlebarAppActionsSide(side: Parameters<typeof setUpstreamTitlebarAppActionsSide>[0]) {
  setUpstreamTitlebarAppActionsSide(side)
}

/** The web wrapper hides HUD, leaving Settings and Layout as the two app tools. */
export function titlebarAppActionsClusterCounts(
  side: Parameters<typeof upstreamTitlebarAppActionsClusterCounts>[0],
  leftExtras = 0,
  rightExtras = 0
): { left: number; right: number } {
  const counts = upstreamTitlebarAppActionsClusterCounts(side, leftExtras, rightExtras)

  return side === 'left'
    ? { left: counts.left - 1, right: counts.right }
    : { left: counts.left, right: counts.right - 1 }
}
