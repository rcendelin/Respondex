import { NavLink, Outlet } from 'react-router-dom'
import { Users, FileText, PlayCircle, BarChart2 } from 'lucide-react'
import { cn } from '../lib/utils'

const NAV_ITEMS = [
  { to: '/populace', icon: Users, label: 'Populace' },
  { to: '/dotazniky', icon: FileText, label: 'Dotazníky' },
  { to: '/simulace', icon: PlayCircle, label: 'Simulace' },
  { to: '/vysledky', icon: BarChart2, label: 'Výsledky' },
] as const

export function Layout() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r bg-muted/30 flex flex-col">
        <div className="px-6 py-5 border-b">
          <h1 className="text-lg font-bold tracking-tight">Respondex</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Simulátor průzkumů</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t text-xs text-muted-foreground">
          MVP v0.1
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
