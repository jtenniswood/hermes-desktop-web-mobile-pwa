import type { LayoutNode } from '@/components/pane-shell/tree/model'

// Browser chrome owns navigation; the upstream workspace still owns session,
// route and preview tabs, their lifetimes, focus, drafts, and contributed tools.
// Project the shared tree without rewriting it or mounting a second sidebar.
export function browserWorkspaceTree(node: LayoutNode, panelIds: ReadonlySet<string> = new Set()): LayoutNode | null {
  if (node.type === 'group') {
    const panes = node.panes.filter(id => !['sessions', 'hermes-bots:pane', 'terminal'].includes(id))
    // Standing desktop sidebars rely on titlebar toggles. Browser panels need
    // their own close handle even when they are the only tab in a zone.
    return panes.length ? { ...node, panes, active: panes.includes(node.active) ? node.active : panes[0], ...(panes.some(id => panelIds.has(id)) ? { tabStrip: 'always' as const } : {}) } : null
  }
  const pairs = node.children.map((child, index) => ({ node: browserWorkspaceTree(child, panelIds), weight: node.weights[index] })).filter(pair => pair.node)
  if (!pairs.length) return null
  if (pairs.length === 1) return pairs[0].node
  return { ...node, children: pairs.map(pair => pair.node!), weights: pairs.map(pair => pair.weight) }
}
