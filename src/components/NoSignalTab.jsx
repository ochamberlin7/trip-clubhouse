import { useScoreSync } from '../lib/useScoreSync'

// The small red "No signal" tab hanging from the top of the screen — shown on any
// screen while the phone is offline or scores are still waiting to sync, and gone
// once everything has synced. (Styles: .no-signal-tab in index.css.)
export default function NoSignalTab() {
  const { pending, online } = useScoreSync()
  if (online && pending === 0) return null
  return <div role="status" className="no-signal-tab">No signal — scores will update when it&apos;s back</div>
}
