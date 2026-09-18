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
      if (importer?.replaceAll('\\', '/').endsWith('/upstream/comparison-titlebar.tsx')) return null
      if (!/(?:^|\/)(?:app(?:\/index)?|titlebar-controls)(?:\.tsx)?$/.test(source)) return null
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      const id = resolved?.id.replaceAll('\\', '/')
      if (id?.endsWith('/desktop/src/app/index.tsx')) return path.join(root, 'src/upstream/comparison-root.tsx')
      if (id?.endsWith('/desktop/src/app/shell/titlebar-controls.tsx')) return path.join(root, 'src/upstream/comparison-titlebar.tsx')
      return null
    },
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/desktop/src/lib/storage.ts')) return null
      return { code: scopeComparisonStorage(code), map: null }
    }
  }
}
