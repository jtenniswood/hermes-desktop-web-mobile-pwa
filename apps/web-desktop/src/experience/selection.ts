import { assertSafeReload } from '../platform/reload-safety'
export type ShellExperience = 'desktop' | 'browser'
const STORAGE_KEY = 'hermes-web.comparison.experience'
export function resolveExperience(search: string, remembered: string | null): ShellExperience {
  const requested = new URLSearchParams(search).get('experience')
  return requested === 'browser' || requested === 'desktop' ? requested : remembered === 'browser' ? 'browser' : 'desktop'
}
let experience: ShellExperience = 'desktop'
export function initializeComparison(): void {
  let remembered = null
  try { remembered = sessionStorage.getItem(STORAGE_KEY) } catch { /* Query selection still works. */ }
  experience = resolveExperience(window.location.search, remembered)
  try { sessionStorage.setItem(STORAGE_KEY, experience) } catch { /* Per-tab persistence is optional. */ }
  document.documentElement.dataset.experience = experience
}
export function currentExperience(): ShellExperience { return experience }
export function switchExperience(next: ShellExperience): void {
  if (next === experience) return
  assertSafeReload()
  const url = new URL(window.location.href)
  url.searchParams.set('experience', next)
  try { sessionStorage.setItem(STORAGE_KEY, next) } catch { /* The URL retains the choice. */ }
  window.location.assign(url.toString())
}
