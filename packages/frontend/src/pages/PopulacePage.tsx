import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, Plus, Download, Trash2, FileUp, Wand2, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getPopulations, createPopulation, exportPopulation, deletePopulation, downloadTemplate,
  getPersons, generatePopulation,
  type PopulationListItem, type GenerateParams,
} from '../lib/api'
import type { Person } from '@respondex/shared'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select'

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

// ── Generate dialog ────────────────────────────────────────────────────────

interface GenerateDialogProps {
  populationId: string
  open: boolean
  onClose: () => void
  onGenerated: () => void
}

const CZECH_REGIONS = [
  'Praha', 'Středočeský', 'Jihočeský', 'Plzeňský', 'Karlovarský',
  'Ústecký', 'Liberecký', 'Královéhradecký', 'Pardubický', 'Kraj Vysočina',
  'Jihomoravský', 'Olomoucký', 'Zlínský', 'Moravskoslezský',
]

function GenerateDialog({ populationId, open, onClose, onGenerated }: GenerateDialogProps) {
  const [count, setCount] = useState('100')
  const [malePct, setMalePct] = useState('49')
  const [ageMin, setAgeMin] = useState('18')
  const [ageMax, setAgeMax] = useState('80')
  const [region, setRegion] = useState<string>('_uniform')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setCount('100'); setMalePct('49'); setAgeMin('18'); setAgeMax('80')
    setRegion('_uniform'); setError(null); setLoading(false)
  }

  function handleClose() { reset(); onClose() }

  function validate(): GenerateParams | null {
    const c = parseInt(count, 10)
    const mp = parseInt(malePct, 10)
    const mn = parseInt(ageMin, 10)
    const mx = parseInt(ageMax, 10)
    if (!Number.isInteger(c) || c < 10 || c > 500) { setError('Počet osob musí být 10–500.'); return null }
    if (!Number.isInteger(mp) || mp < 0 || mp > 100) { setError('Podíl mužů musí být 0–100 %.'); return null }
    if (!Number.isInteger(mn) || mn < 18 || mn > 99) { setError('Minimální věk musí být 18–99.'); return null }
    if (!Number.isInteger(mx) || mx < 19 || mx > 100) { setError('Maximální věk musí být 19–100.'); return null }
    if (mn >= mx) { setError('Minimální věk musí být nižší než maximální.'); return null }
    const params: GenerateParams = { count: c, male_pct: mp, age_min: mn, age_max: mx }
    if (region !== '_uniform') params.region = region
    return params
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const params = validate()
    if (!params) return
    setLoading(true)
    try {
      await generatePopulation(populationId, params)
      reset()
      onGenerated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neočekávaná chyba.')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Generovat osoby (statisticky)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gen-count">Počet osob</Label>
              <Input id="gen-count" type="number" min={10} max={500} value={count}
                onChange={(e) => setCount(e.target.value)} disabled={loading} />
              <p className="text-xs text-muted-foreground">10–500</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-male">Podíl mužů (%)</Label>
              <Input id="gen-male" type="number" min={0} max={100} value={malePct}
                onChange={(e) => setMalePct(e.target.value)} disabled={loading} />
              <p className="text-xs text-muted-foreground">výchozí: 49</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-agemin">Věk od</Label>
              <Input id="gen-agemin" type="number" min={18} max={99} value={ageMin}
                onChange={(e) => setAgeMin(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-agemax">Věk do</Label>
              <Input id="gen-agemax" type="number" min={19} max={100} value={ageMax}
                onChange={(e) => setAgeMax(e.target.value)} disabled={loading} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-region">Dominantní kraj</Label>
            <Select value={region} onValueChange={setRegion} disabled={loading}>
              <SelectTrigger id="gen-region">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_uniform">Rovnoměrně (všechny kraje)</SelectItem>
                {CZECH_REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Rozložení vzdělání, zaměstnání a příjmů vychází z dat ČSÚ 2021. Generování neprobíhá přes AI.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Zrušit</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Generuji…' : 'Generovat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Population detail dialog ───────────────────────────────────────────────

interface PopulationDetailDialogProps {
  population: PopulationListItem | null
  onClose: () => void
  onPopulationChanged: () => void
}

const PAGE_SIZE = 20

function displayVal(val: string | number | boolean | undefined | null): string {
  if (val === undefined || val === null || val === '') return '–'
  if (typeof val === 'boolean') return val ? 'Ano' : 'Ne'
  return String(val)
}

function PersonsTable({ persons }: { persons: Person[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50 sticky top-0">
            {['ID', 'Věk', 'Pohlaví', 'Vzdělání', 'Stav', 'Partner', 'Status', 'Příjem', 'Kraj'].map((h) => (
              <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {persons.map((p) => (
            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
              <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{p.id.substring(0, 8)}…</td>
              <td className="px-3 py-2">{p.age}</td>
              <td className="px-3 py-2">{p.gender}</td>
              <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.education)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.marital_status)}</td>
              <td className="px-3 py-2">{displayVal(p.demographics?.has_partner)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.employment_status)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.income_level)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.region)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PopulationDetailDialog({ population, onClose, onPopulationChanged }: PopulationDetailDialogProps) {
  const [persons, setPersons] = useState<Person[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loadingPersons, setLoadingPersons] = useState(false)
  const [personsError, setPersonsError] = useState<string | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  const loadedForRef = useRef<string | null>(null)

  useEffect(() => {
    if (!population) return
    if (loadedForRef.current !== population.id) {
      loadedForRef.current = population.id
      if (offset !== 0) { setOffset(0); return }
    }
    let cancelled = false
    setLoadingPersons(true)
    setPersonsError(null)
    getPersons(population.id, offset, PAGE_SIZE)
      .then((page) => {
        if (!cancelled) { setPersons(page.persons); setTotal(page.total) }
      })
      .catch((err) => {
        if (!cancelled) setPersonsError(err instanceof Error ? err.message : 'Chyba při načítání osob.')
      })
      .finally(() => { if (!cancelled) setLoadingPersons(false) })
    return () => { cancelled = true }
  }, [population, offset])

  function handleClose() {
    setPersons([]); setTotal(0); setOffset(0); setPersonsError(null)
    loadedForRef.current = null
    onClose()
  }

  function handleGenerated() {
    setGenerateOpen(false)
    loadedForRef.current = null
    setOffset(0)
    onPopulationChanged()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd = Math.min(offset + PAGE_SIZE, total)

  return (
    <>
      <Dialog open={!!population} onOpenChange={(o) => { if (!o) handleClose() }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <div className="flex items-start justify-between pr-8">
              <div>
                <DialogTitle className="text-xl">{population?.name}</DialogTitle>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                  <span>
                    <Badge variant="secondary" className="mr-1.5">{population?.person_count ?? 0}</Badge>
                    osob
                  </span>
                  <span>Vytvořeno {population ? formatDate(population.created_at) : ''}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)} className="flex-shrink-0">
                <Wand2 className="h-4 w-4 mr-1.5" />
                Generovat
              </Button>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingPersons && (
              <p className="text-sm text-muted-foreground px-6 py-4">Načítám osoby…</p>
            )}
            {personsError && (
              <p className="text-sm text-destructive px-6 py-4">{personsError}</p>
            )}
            {!loadingPersons && !personsError && persons.length === 0 && (
              <p className="text-sm text-muted-foreground px-6 py-8 text-center">
                Populace neobsahuje žádné osoby.{' '}
                <button className="underline" onClick={() => setGenerateOpen(true)}>
                  Generovat statisticky
                </button>
                {' '}nebo importujte XLSX.
              </p>
            )}
            {!loadingPersons && persons.length > 0 && (
              <PersonsTable persons={persons} />
            )}
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-6 py-3 border-t flex-shrink-0 bg-muted/30">
              <span className="text-xs text-muted-foreground">
                {rangeStart}–{rangeEnd} z {total} osob
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7"
                  disabled={offset === 0 || loadingPersons}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-7 w-7"
                  disabled={offset + PAGE_SIZE >= total || loadingPersons}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate sub-dialog — sibling to avoid nested portal focus-trap conflict */}
      {population && (
        <GenerateDialog
          populationId={population.id}
          open={generateOpen}
          onClose={() => setGenerateOpen(false)}
          onGenerated={handleGenerated}
        />
      )}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function PopulacePage() {
  const [populations, setPopulations] = useState<PopulationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PopulationListItem | null>(null)
  const [detailTarget, setDetailTarget] = useState<PopulationListItem | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const data = await getPopulations()
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
      // Non-critical
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

      {loading && <p className="text-muted-foreground text-sm">Načítám populace…</p>}
      {fetchError && <p className="text-destructive text-sm">{fetchError}</p>}

      {!loading && !fetchError && populations.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground text-sm">
              Zatím žádné populace.{' '}
              <button className="underline" onClick={() => setNewDialogOpen(true)}>Vytvořte první</button>
              {' '}nebo{' '}
              <button className="underline" onClick={() => downloadTemplate('population')}>stáhněte vzorovou šablonu</button>.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && populations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Populace ({populations.length})</CardTitle>
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
                  <tr
                    key={p.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setDetailTarget(p)}
                  >
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
                          onClick={(e) => { e.stopPropagation(); void handleExport(p.id) }}
                        >
                          <FileUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Smazat populaci"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
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
      <PopulationDetailDialog
        population={detailTarget}
        onClose={() => setDetailTarget(null)}
        onPopulationChanged={() => {
          void load()
          // Keep detail open — persons re-fetch triggered by offset reset inside dialog
        }}
      />
    </div>
  )
}
