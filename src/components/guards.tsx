import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession, type Role } from '@/lib/session'

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session, ready } = useSession()
  const location = useLocation()
  if (!ready) return <div className="min-h-dvh" />
  if (!session) return <Navigate to="/" replace state={{ from: location.pathname }} />
  if (!roles.includes(session.role)) return <Navigate to={session.role === 'door' ? '/porta' : '/admin'} replace />
  return <>{children}</>
}
