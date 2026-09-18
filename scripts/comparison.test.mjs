import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const root = path.resolve('apps/web-desktop')
function load(file, globals = {}) {
  const filename = path.join(root, file)
  const context = vm.createContext({ exports: {}, require: createRequire(filename), ...globals })
  vm.runInContext(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context)
  return context.exports
}
const { comparisonPlugin, scopeComparisonStorage } = load('src/upstream/comparison-plugin.ts')
test('comparison shell contracts reject missing or changed upstream modules', t => {
  comparisonPlugin(root).buildStart()
  const fixture = mkdtempSync(path.join(tmpdir(), 'comparison-contract-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  mkdirSync(path.join(fixture, 'desktop/src/app'), { recursive: true })
  const plugin = comparisonPlugin(path.join(fixture, 'web-desktop'))
  assert.throws(() => plugin.buildStart(), /ENOENT/)
  writeFileSync(path.join(fixture, 'desktop/src/app/index.tsx'), 'changed')
  assert.throws(() => plugin.buildStart(), /Comparison integration changed: app\/index.tsx/)
})
test('browser layout storage is isolated, deterministic and checked without moving shared drafts', () => {
  const filename = '../desktop/src/lib/storage.ts'
  const source = readFileSync(path.join(root, filename), 'utf8')
  const output = scopeComparisonStorage(source)
  assert.equal(scopeComparisonStorage(output), output)
  assert.throws(() => scopeComparisonStorage(source + '\n// upstream change'), /no longer matches/)
  assert.throws(() => scopeComparisonStorage(output.replace("key = 'hermes-web.browser.' + key", "key = 'bad'")), /no longer matches/)
  const store = new Map()
  const context = vm.createContext({ exports: {}, require: createRequire(path.join(root, filename)), document: { documentElement: { dataset: { experience: 'browser' } } }, localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) } })
  context.window = { localStorage: context.localStorage }
  vm.runInContext(ts.transpileModule(output, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const { readKey, writeKey } = context.exports
  writeKey('hermes.desktop.layout.tree', 'browser-layout')
  writeKey('hermes.desktop.composerDrafts', 'shared-draft')
  writeKey('hermes.desktop.theme', 'dark')
  assert.equal(store.get('hermes-web.browser.hermes.desktop.layout.tree'), 'browser-layout')
  assert.equal(store.get('hermes.desktop.composerDrafts'), 'shared-draft')
  assert.equal(store.get('hermes.desktop.theme'), 'dark')
  context.document.documentElement.dataset.experience = 'desktop'
  assert.equal(readKey('hermes.desktop.layout.tree'), null)
  writeKey('hermes.desktop.layout.tree', 'desktop-layout')
  context.document.documentElement.dataset.experience = 'browser'
  assert.equal(readKey('hermes.desktop.layout.tree'), 'browser-layout')
})
test('experience selection respects explicit links, per-tab choice and safe reloads without changing hashes', () => {
  let blocked = false, assigned
  const store = new Map()
  const globals = { URL, URLSearchParams, document: { documentElement: { dataset: {} } }, sessionStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }, window: { location: { search: '', href: 'https://preview.test/?other=keep#/session-123', assign: url => { assigned = url } } }, require: () => ({ assertSafeReload() { if (blocked) throw new Error('busy') } }) }
  const selection = load('src/experience/selection.ts', globals)
  assert.equal(selection.resolveExperience('', null), 'desktop')
  assert.equal(selection.resolveExperience('', 'browser'), 'browser')
  assert.equal(selection.resolveExperience('?experience=desktop', 'browser'), 'desktop')
  assert.equal(selection.resolveExperience('?experience=unknown', null), 'desktop')
  selection.initializeComparison()
  blocked = true
  assert.throws(() => selection.switchExperience('browser'), /busy/)
  assert.equal(assigned, undefined)
  blocked = false
  selection.switchExperience('browser')
  const url = new URL(assigned)
  assert.equal(url.hash, '#/session-123')
  assert.equal(url.searchParams.get('other'), 'keep')
  assert.equal(url.searchParams.get('experience'), 'browser')
})
