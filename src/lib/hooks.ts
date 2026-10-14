import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from './api'

/** Busca simples com refrescamento opcional (polling) e recarga manual. */
export function useApi<T>(path: string | null, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const alive = useRef(true)

  const load = useCallback(async () => {
    if (!path) return
    try {
      const d = await api.get<T>(path)
      if (alive.current) {
        setData(d)
        setError(null)
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    alive.current = true
    void load()
    if (!intervalMs) return () => void (alive.current = false)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, intervalMs)
    return () => {
      alive.current = false
      window.clearInterval(id)
    }
  }, [load, intervalMs])

  return { data, error, loading, reload: load, setData }
}

export function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}
