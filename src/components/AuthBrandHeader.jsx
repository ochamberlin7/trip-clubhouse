// Top of the sign-in / sign-up cards. Following a resort trip's invite link
// (redirect=/join/:token) it shows the resort's logo, the trip name and
// "Powered by Trip Clubhouse", and themes the page in the resort's colors.
// Otherwise it's the stock "Trip Clubhouse" eyebrow.
import { inviteTokenFromRedirect } from '../lib/brand'
import { useInviteResort, useApplyResortTheme } from '../lib/useResortBrand'
import ResortMark from './ResortMark'

export default function AuthBrandHeader({ redirect, title }) {
  const brand = useInviteResort(inviteTokenFromRedirect(redirect))
  useApplyResortTheme(brand)

  if (!brand) {
    return (
      <div>
        <p className="auth-brand">Trip Clubhouse</p>
        <h2>{title}</h2>
      </div>
    )
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <ResortMark resort={brand} logoHeight={44} nameSize={22} />
      {brand.trip_name && (
        <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--slate)' }}>
          You&rsquo;re invited to <strong style={{ color: 'var(--ink)' }}>{brand.trip_name}</strong>
        </p>
      )}
      <h2 style={{ marginTop: 6 }}>{title}</h2>
    </div>
  )
}
