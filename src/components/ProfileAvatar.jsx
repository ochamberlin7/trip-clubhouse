// Circular initials badge for the logged-in user. Reads the auth account record
// (not any per-trip player row) so it always reflects who is signed in.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { accountAvatarUrl } from '../lib/avatar'

// First + last initial from the display name; falls back to the email.
export function accountInitials(user) {
  const name = (user?.user_metadata?.display_name || '').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (user?.email || '?').slice(0, 2).toUpperCase()
}

// Shared visual for the circular badge, reused by both the standalone avatar
// and the inline badge embedded in other rows (e.g. the drawer's Profile item).
const badgeBase = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  background: '#1B3F6E',
  color: '#fff',
  border: '2px solid #fff',
  boxShadow: '0 1px 4px rgba(13, 27, 42, 0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.5px',
  flexShrink: 0,
  overflow: 'hidden',
}

// The photo if the account has one (falls back to initials if it fails to load),
// otherwise the initials.
function BadgeContent({ user }) {
  const url = accountAvatarUrl(user)
  const [failedUrl, setFailedUrl] = useState(null)
  if (url && failedUrl !== url) {
    return <img src={url} alt="" onError={() => setFailedUrl(url)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  }
  return accountInitials(user)
}


// Non-interactive badge for embedding inside another clickable row (avoids
// nesting a <button> inside a <button>). Renders just the circle + initials.
export function ProfileBadge({ style }) {
  const { user } = useAuth()
  if (!user) return null
  return <span style={{ ...badgeBase, ...style }}><BadgeContent user={user} /></span>
}

// Standalone tappable avatar (absolute-positioned in a header corner).
export default function ProfileAvatar({ style }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  return (
    <button
      type="button"
      aria-label="Your profile"
      title="Your profile"
      onClick={() => navigate('/profile')}
      style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top) + 60px)',
        right: 14,
        zIndex: 90,
        cursor: 'pointer',
        padding: 0,
        ...badgeBase,
        ...style,
      }}
    >
      <BadgeContent user={user} />
    </button>
  )
}
