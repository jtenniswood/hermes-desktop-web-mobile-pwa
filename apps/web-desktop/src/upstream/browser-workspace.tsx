import { useStore } from '@nanostores/react'
import { useEffect } from 'react'
import { $layoutTree, trackActiveTreeGroup } from '@/components/pane-shell/tree/store'
import { TreeNode } from '@/components/pane-shell/tree/renderer/tree-node'
import { FloatingPanes } from '@/components/pane-shell/tree/renderer/floating-panes'
import { NarrowOverlays } from '@/components/pane-shell/tree/renderer/narrow-overlays'
import { browserWorkspaceTree } from './workspace-tree'
import { useTabKeyHints } from '@/components/pane-shell/tree/tab-key-hint-state'

export function BrowserWorkspace() {
  const tree = useStore($layoutTree)
  useEffect(trackActiveTreeGroup, [])
  useTabKeyHints()
  const workspace = tree && browserWorkspaceTree(tree)
  return <div className="browser-upstream-workspace">
    {workspace && <TreeNode node={workspace} root rootRow={workspace.type === 'split' && workspace.orientation === 'row'} />}
    <NarrowOverlays />
    <FloatingPanes />
  </div>
}
