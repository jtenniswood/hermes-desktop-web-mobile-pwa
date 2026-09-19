import { useStore } from '@nanostores/react'
import { PANE_TOGGLE_REVEAL_EVENT } from '@/components/pane-shell'
import { $collapsedTreeSides, $narrowViewport, $paneVisible, closeTabPane, restoreTreePane, treeSideOfPane } from '@/components/pane-shell/tree/store'

/** Keep each contribution's owning store in sync with its browser controls. */
export function BrowserPanelButton({ id, title, collapsible, onOpen }: { id: string; title: string; collapsible: boolean; onOpen: () => void }) {
  const visible = useStore($paneVisible(id))
  const collapsed = useStore($collapsedTreeSides)
  const narrow = useStore($narrowViewport) && collapsible
  const side = treeSideOfPane(id)
  const open = visible && !(side && collapsed.has(side))
  return <button aria-pressed={narrow ? undefined : open} onClick={() => {
    if (!narrow && open) { closeTabPane(id); return }
    restoreTreePane(id)
    if (narrow) {
      // The overlay reads newly unhidden contributions after React commits.
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(PANE_TOGGLE_REVEAL_EVENT, { detail: { id, mode: 'open' } })))
    }
    onOpen()
  }}>{title}</button>
}
