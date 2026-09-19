import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { Plugin } from 'vite'
import contracts from './comparison-contracts.json'
const storageScope = `\n  if (document.documentElement.dataset.experience === 'browser' && /^hermes\\.desktop\\.(?:layout|pane|sidebar|fileBrowser|rightRail|profileRail|terminal|statusbar|hiddenStrip|dismissedPanes|userPlaced)/.test(key)) key = 'hermes-web.browser.' + key\n`
export function scopeComparisonStorage(source: string): string {
  const original = source.split(storageScope).join('')
  const contract = contracts.find(item => item.module === 'lib/storage.ts')!
  if (createHash('sha256').update(original).digest('hex') !== contract.sourceHash) throw new Error('Comparison storage scope no longer matches upstream')
  const targets = ['export function readKey(key: string): null | string {', 'export function writeKey(key: string, value: null | string) {']
  let output = original
  for (const target of targets) {
    if (output.split(target).length !== 2) throw new Error('Comparison storage scope no longer matches upstream')
    output = output.replace(target, target + storageScope)
  }
  if (source !== original && source !== output) throw new Error('Comparison storage scope was partially modified')
  return output
}
export function filterBrowserNarrowNavigation(source: string): string {
  const before = 'panes.filter(p => paneChrome(p).collapsible && inTree.has(p.id)'
  const after = "panes.filter(p => (document.documentElement.dataset.experience !== 'browser' || !['sessions', 'hermes-bots:pane', 'terminal'].includes(p.id)) && paneChrome(p).collapsible && inTree.has(p.id)"
  const headerTarget = '          {/* Zone-mates share the overlay'
  const closeHeader = `          {document.documentElement.dataset.experience === 'browser' && (
            <div className="browser-overlay-title">
              <span>{revealed.title ?? revealed.id}</span>
              <button aria-label={\`Close \${revealed.title ?? revealed.id} panel\`} onClick={() => { setReveal(null); closeTabPane(revealed.id) }}>×</button>
            </div>
          )}
`
  const replacements = [
    [before, after],
    ['import { $hiddenTreePanes, $layoutTree, $narrowViewport }', 'import { $hiddenTreePanes, $layoutTree, $narrowViewport, closeTabPane }'],
    [headerTarget, closeHeader + headerTarget]
  ]
  let original = source
  for (const [target, replacement] of replacements) original = original.replace(replacement, target)
  const contract = contracts.find(item => item.module.endsWith('/narrow-overlays.tsx'))!
  if (createHash('sha256').update(original).digest('hex') !== contract.sourceHash) throw new Error('Comparison narrow tool overlay contract changed')
  let output = original
  for (const [target, replacement] of replacements) {
    if (output.split(target).length !== 2) throw new Error('Comparison narrow tool overlay target changed')
    output = output.replace(target, replacement)
  }
  if (source !== original && source !== output) throw new Error('Comparison narrow tool overlay was partially modified')
  return output
}
export function closeBrowserWorkspacePanels(source: string): string {
  // Without a selected project the visibility binding already reads false,
  // so calling the owner's closer cannot emit another false notification.
  // Explicit browser Close must also hide a manually revealed empty panel.
  const before = 'export function closeTreePane(paneId: string) {\n  const closer = paneClosers[paneId]\n\n  if (closer) {\n    closer()'
  const after = before + "\n    if (document.documentElement.dataset.experience === 'browser' && ['files', 'review'].includes(paneId)) setTreePaneHidden(paneId, true)"
  const original = source.replace(after, before)
  const contract = contracts.find(item => item.module === 'components/pane-shell/tree/store.ts')!
  if (createHash('sha256').update(original).digest('hex') !== contract.sourceHash || original.split(before).length !== 2) throw new Error('Comparison empty-panel close contract changed')
  return original.replace(before, after)
}
export function exportBrowserStatusbarItem(source: string): string {
  const before = 'const StatusbarItemView = memo(function StatusbarItemView('
  const after = 'export ' + before
  const original = source.replace(after, before)
  const contract = contracts.find(item => item.module === 'app/shell/statusbar-controls.tsx')!
  if (createHash('sha256').update(original).digest('hex') !== contract.sourceHash || original.split(before).length !== 2) throw new Error('Comparison statusbar item contract changed')
  return original.replace(before, after)
}
export function comparisonPlugin(root: string): Plugin {
  const sourceRoot = path.resolve(root, '../desktop/src')
  return {
    name: 'hermes:comparison-shell', enforce: 'pre',
    buildStart() {
      for (const contract of contracts) {
        const source = readFileSync(path.join(sourceRoot, contract.module), 'utf8')
        if (createHash('sha256').update(source).digest('hex') !== contract.sourceHash) throw new Error(`Comparison integration changed: ${contract.module}. Review the shell contract.`)
      }
    },
    async resolveId(source, importer) {
      if (source === 'hermes:statusbar-item') return path.join(sourceRoot, 'app/shell/statusbar-controls.tsx')
      if (/\/upstream\/comparison-(?:titlebar|statusbar)\.tsx$/.test(importer?.replaceAll('\\', '/') || '')) return null
      if (!/(?:^|\/)(?:app(?:\/index)?|titlebar-controls|statusbar-controls)(?:\.tsx)?$/.test(source)) return null
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      const id = resolved?.id.replaceAll('\\', '/')
      if (id?.endsWith('/desktop/src/app/index.tsx')) return path.join(root, 'src/upstream/comparison-root.tsx')
      if (id?.endsWith('/desktop/src/app/shell/titlebar-controls.tsx')) return path.join(root, 'src/upstream/comparison-titlebar.tsx')
      if (id?.endsWith('/desktop/src/app/shell/statusbar-controls.tsx')) return path.join(root, 'src/upstream/comparison-statusbar.tsx')
      return null
    },
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/desktop/src/app/shell/statusbar-controls.tsx')) return { code: exportBrowserStatusbarItem(code), map: null }
      if (id.replaceAll('\\', '/').endsWith('/desktop/src/components/pane-shell/tree/store.ts')) return { code: closeBrowserWorkspacePanels(code), map: null }
      if (id.replaceAll('\\', '/').endsWith('/desktop/src/components/pane-shell/tree/renderer/narrow-overlays.tsx')) return { code: filterBrowserNarrowNavigation(code), map: null }
      if (!id.replaceAll('\\', '/').endsWith('/desktop/src/lib/storage.ts')) return null
      return { code: scopeComparisonStorage(code), map: null }
    }
  }
}
