import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/lib/session'
import { RequireRole } from '@/components/guards'
import LoginPage from '@/pages/login'
import './index.css'

const CredentialPage = lazy(() => import('@/pages/credential'))
const DoorPage = lazy(() => import('@/pages/door'))
const AdminLayout = lazy(() => import('@/pages/admin/layout'))
const OverviewPage = lazy(() => import('@/pages/admin/overview'))
const GuestsPage = lazy(() => import('@/pages/admin/guests'))
const ImportPage = lazy(() => import('@/pages/admin/import'))
const InvitesPage = lazy(() => import('@/pages/admin/invites'))
const EventPage = lazy(() => import('@/pages/admin/event'))

function Fallback() {
  return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">A carregar…</div>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/c/:token" element={<CredentialPage />} />
            <Route
              path="/porta"
              element={
                <RequireRole roles={['door', 'admin']}>
                  <DoorPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole roles={['admin']}>
                  <AdminLayout />
                </RequireRole>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="convidados" element={<GuestsPage />} />
              <Route path="importar" element={<ImportPage />} />
              <Route path="convites" element={<InvitesPage />} />
              <Route path="evento" element={<EventPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
