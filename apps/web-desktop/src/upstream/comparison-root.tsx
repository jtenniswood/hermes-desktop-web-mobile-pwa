import { BrowserShell } from '../experience/browser-shell'
import { currentExperience } from '../experience/selection'
import { ExperienceSelector } from '../experience/selector'
import { useEffect } from 'react'
import { DesktopController, $activeGatewayProfile, selectProfile } from './comparison-api'
import '../experience/comparison.css'
export default function ComparisonRoot() {
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('hermes-web.comparison.profile')
      if (saved) selectProfile(saved)
    } catch { /* Optional tab state. */ }
    return $activeGatewayProfile.subscribe(profile => {
      try { sessionStorage.setItem('hermes-web.comparison.profile', profile) } catch { /* Optional tab state. */ }
    })
  }, [])
  return currentExperience() === 'browser' ? <BrowserShell /> : <>
    <div className="desktop-comparison-bar"><span>Hermes <small>Interface preview</small></span><ExperienceSelector /></div>
    <div className="desktop-comparison-content"><DesktopController /></div>
  </>
}
