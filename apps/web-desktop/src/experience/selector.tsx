import { useEffect, useState } from 'react'
import { currentExperience, switchExperience, type ShellExperience } from './selection'
import { reloadReadiness } from '../platform/reload-safety'
export function ExperienceSelector() {
  const [reason, setReason] = useState<string | undefined>()
  const [message, setMessage] = useState('')
  useEffect(() => {
    // Reading readiness flushes text through the upstream draft adapter.
    const check = () => setReason(reloadReadiness().reason)
    check(); const timer = setInterval(check, 1000)
    return () => clearInterval(timer)
  }, [])
  return <div className="experience-control">
    <label><span>Experience</span><select aria-label="Experience" value={currentExperience()} disabled={!!reason} title={reason} onChange={event => {
      try { switchExperience(event.target.value as ShellExperience) } catch (error) { setMessage(String(error instanceof Error ? error.message : error)) }
    }}><option value="desktop">Desktop familiar</option><option value="browser">Browser focused</option></select></label>
    {(reason || message) && <span className="experience-reason" role="status">{reason || message}</span>}
  </div>
}
