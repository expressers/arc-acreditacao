import { NavLink, Outlet, Link } from 'react-router'
import { CalendarCog, FileSpreadsheet, LayoutGrid, LogOut, Mail, ScanLine, Users } from 'lucide-react'
import { dateBlock } from '@shared/format'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', label: 'Resumo', icon: LayoutGrid, end: true },
  { to: '/admin/convidados', label: 'Convidados', icon: Users },
  { to: '/admin/importar', label: 'Importar', icon: FileSpreadsheet },
  { to: '/admin/convites', label: 'Convites', icon: Mail },
  { to: '/admin/evento', label: 'Evento', icon: CalendarCog },
]

export default function AdminLayout() {
  const { settings, logout } = useSession()
  const d = settings ? dateBlock(settings.date) : null

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      {/* Lateral (ecrãs largos) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card md:flex">
        <div className="arc-sky relative overflow-hidden px-5 pt-6 pb-5 text-white">
          <p className="text-xs font-semibold text-white/85">Acreditação</p>
          <p className="display mt-2 text-2xl">{settings ? `${settings.edition} Conferência ARC` : '—'}</p>
          {d && <p className="mt-1 text-sm font-semibold tabular">{d.day} {d.month} · {settings?.venue}</p>}
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t p-3">
          <Button asChild variant="outline" className="h-10 w-full justify-start gap-3">
            <Link to="/porta">
              <ScanLine className="size-4" /> Abrir leitor
            </Link>
          </Button>
          <Button variant="ghost" className="h-10 w-full justify-start gap-3 text-muted-foreground" onClick={() => void logout()}>
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Topo (telemóvel) */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/90 px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 backdrop-blur-md md:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{settings ? `${settings.edition} Conferência ARC` : 'Acreditação'}</p>
            {d && <p className="text-xs text-muted-foreground tabular">{d.day} {d.month} · {settings?.venue}</p>}
          </div>
          <Button asChild size="icon-lg" variant="ghost" aria-label="Abrir leitor">
            <Link to="/porta">
              <ScanLine />
            </Link>
          </Button>
          <Button size="icon-lg" variant="ghost" aria-label="Sair" onClick={() => void logout()}>
            <LogOut />
          </Button>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">
          <Outlet />
        </main>

        {/* Navegação inferior (telemóvel) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
