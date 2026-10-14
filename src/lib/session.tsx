import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { EventSettings } from '@shared/guests'
import { api } from './api'

export type Role = 'admin' | 'door'
export interface SessionInfo {
  role: Role
  name: string
}

interface Ctx {
  session: SessionInfo | null
  ready: boolean
  settings: EventSettings | null
  setSettings: (s: EventSettings) => void
  login: (role: Role, secret: string, name?: string) => Promise<SessionInfo>
  logout: () => Promise<void>
}

const SessionContext = createContext<Ctx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api
      .get<SessionInfo>('/api/session')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setReady(true))
    api.get<EventSettings>('/api/public/settings').then(setSettings).catch(() => {})
    const onExpired = () => setSession(null)
    window.addEventListener('session-expired', onExpired)
    return () => window.removeEventListener('session-expired', onExpired)
  }, [])

  const login = useCallback(async (role: Role, secret: string, name?: string) => {
    const s = await api.post<SessionInfo>('/api/login', { role, secret, name })
    setSession(s)
    return s
  }, [])

  const logout = useCallback(async () => {
    await api.post('/api/logout').catch(() => {})
    setSession(null)
  }, [])

  return (
    <SessionContext.Provider value={{ session, ready, settings, setSettings, login, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession fora do SessionProvider')
  return ctx
}
