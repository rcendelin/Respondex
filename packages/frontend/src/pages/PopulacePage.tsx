import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Download, Trash2, FileUp } from 'lucide-react'
import {
  getPopulations, createPopulation, exportPopulation, deletePopulation, downloadTemplate,
  type PopulationListItem,
} from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ── New-population dialog ──────────────────────────────────────────────────

interface NewPopulationDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function NewPopulationDialog({ open, onClose, onCreated }: NewPopulationDialogProps) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setFile(null)
    setError(null)
    setLoading(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Zadejte název populace.'); return }
    if (!file) { setError('Vyberte soubor XLSX.'); return }
    setLoading(true)
    setError(null)
    try {
      await createPopulation(name.trim(), file)
      reset()
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neočekávaná chyba.')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nová populace</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pop-name">Název populace</Label>
            <Input
              id="pop-name"
              placeholder="např. Česká republika 2024"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pop-file">XLSX soubor</Label>
            <Input
              id="pop-file"
              type="file"
              accept=".xlsx"
              disabled={loading}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Potřebujete šablonu?{' '}
              <button
                type="button"
                className="underline"
                onClick={() => downloadTemplate('population')}
              >
                Stáhnout vzorovou šablonu
              </button>
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Zrušit
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Nahrávám…' : 'Vytvořit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete confirm dialog ──────────────────────────────────────────────────

interface DeleteDialogProps {
  population: PopulationListItem | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ population, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!population) return
    setLoading(true)
    try {
      await deletePopulation(population.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neočekávaná chyba.')
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!population} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Smazat populaci</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Opravdu chcete smazat populaci <strong>{population?.name}</strong>? Tato akce je nevratná.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Zrušit</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Mažu…' : 'Smazat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function PopulacePage() {
  const [populations, setPopulations] = useState<PopulationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PopulationListItem | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const data = await getPopulations()
      // Backend may return { populations: [...] } or raw array
      const list = Array.isArray(data)
        ? data
        : (data as unknown as { populations: PopulationListItem[] }).populations ?? []
      setPopulations(list)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Chyba při načítání populací.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleExport(id: string) {
    setExportingId(id)
    try {
      await exportPopulation(id)
    } catch {
      // Non-critical — user sees no download
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Populace</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate('population')}>
            <Download className="h-4 w-4 mr-1.5" />
            Vzorová šablona
          </Button>
          <Button size="sm" onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nová populace
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <p className="text-muted-foreground text-sm">Načítám populace…</p>
      )}

      {fetchError && (
        <p className="text-destructive text-sm">{fetchError}</p>
      )}

      {!loading && !fetchError && populations.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground text-sm">
              Zatím žádné populace.{' '}
              <button className="underline" onClick={() => setNewDialogOpen(true)}>
                Vytvořte první
              </button>
              {' '}nebo{' '}
              <button className="underline" onClick={() => downloadTemplate('population')}>
                stáhněte vzorovou šablonu
              </button>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && populations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Populace ({populations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium">Název</th>
                  <th className="text-left px-4 py-2.5 font-medium">Počet osob</th>
                  <th className="text-left px-4 py-2.5 font-medium">Vytvořeno</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {populations.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{p.person_count} osob</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Exportovat XLSX"
                          disabled={exportingId === p.id}
                          onClick={() => handleExport(p.id)}
                        >
                          <FileUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Smazat populaci"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <NewPopulationDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => { setNewDialogOpen(false); void load() }}
      />
      <DeleteDialog
        population={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => { setDeleteTarget(null); void load() }}
      />
    </div>
  )
}
