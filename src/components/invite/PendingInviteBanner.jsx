import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function PendingInviteBanner() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('invite')

  if (!token) return null

  return (
    <div className="invite-banner">
      <p>You have a pending group invite.</p>
      <button onClick={() => navigate(`/invite/${token}`)}>View Invite</button>
    </div>
  )
}
