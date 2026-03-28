import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, Plus, Download, Trash2, FileUp, Wand2, ChevronLeft, ChevronRight, Sparkles, Brain, BarChart3, Table2 } from 'lucide-react'
import {
  getPopulations, createPopulation, exportPopulation, deletePopulation, downloadTemplate,
  getPersons, generatePopulation, enrichPopulation,
  type PopulationListItem, type GenerateParams,
} from '../lib/api'
import type { Person } from '@respondex/shared'
import { computeExpectedScore, scoreToLevel } from '@respondex/shared'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
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
  return new Date(iso).toLocaleString('cs-CZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
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

// ── Enrich dialog ─────────────────────────────────────────────────────────

interface EnrichDialogProps {
  populationId: string
  totalPersons: number
  missingStories: number
  open: boolean
  onClose: () => void
  onEnriched: (result: { enriched: number; failed: number }) => void
}

const AI_MODELS = [
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini (výchozí)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-4o', label: 'GPT-4o (vyšší kvalita)' },
]

function EnrichDialog({ populationId, totalPersons, missingStories, open, onClose, onEnriched }: EnrichDialogProps) {
  const [model, setModel] = useState('gpt-5.4-mini')
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  function reset() { setModel('gpt-5.4-mini'); setOnlyMissing(true); setError(null); setLoading(false); setProgress(null) }
  function handleClose() { if (loading) return; reset(); onClose() }

  const count = onlyMissing ? missingStories : totalPersons

  // Estimated time: ~3s per person (with batch concurrency of 10)
  function estimateTime(n: number): string {
    const seconds = Math.ceil(n / 10) * 3
    if (seconds < 60) return `~${seconds}s`
    const mins = Math.ceil(seconds / 60)
    return `~${mins} min`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (count === 0) { setError('Žádné osoby ke zpracování.'); return }
    setLoading(true)
    setError(null)
    setProgress({ done: 0, total: count })

    // For large populations, split into chunks of 100 and call the API
    // repeatedly. Each call processes up to 100 persons server-side.
    const CHUNK_SIZE = 100
    let totalEnriched = 0
    let totalFailed = 0

    try {
      if (count <= CHUNK_SIZE) {
        // Single call — simple case
        const result = await enrichPopulation(populationId, { model, only_missing: onlyMissing })
        totalEnriched = result.enriched
        totalFailed = result.failed
      } else {
        // Multiple calls — the backend always processes only_missing persons,
        // so each subsequent call picks up the next batch of unenriched persons.
        const chunks = Math.ceil(count / CHUNK_SIZE)
        for (let i = 0; i < chunks; i++) {
          const result = await enrichPopulation(populationId, { model, only_missing: onlyMissing })
          totalEnriched += result.enriched
          totalFailed += result.failed
          setProgress({ done: Math.min((i + 1) * CHUNK_SIZE, count), total: count })
          // If no more persons to enrich, stop early
          if (result.enriched === 0 && result.skipped > 0) break
        }
      }

      reset()
      onEnriched({ enriched: totalEnriched, failed: totalFailed })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neočekávaná chyba.')
      if (totalEnriched > 0) {
        // Partial success — report what was done
        setError(`Chyba po zpracování ${totalEnriched} osob: ${err instanceof Error ? err.message : 'Neočekávaná chyba.'}`)
      }
      setLoading(false)
      setProgress(null)
    }
  }

  const progressPct = progress ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Generovat životní příběhy (AI)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            OpenAI vygeneruje krátký autentický životní příběh pro každou osobu na základě jejích
            demografických atributů. Příběhy zlepší kvalitu simulací při použití Strategie C.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="enrich-model">Model</Label>
            <Select value={model} onValueChange={setModel} disabled={loading}>
              <SelectTrigger id="enrich-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
            <input
              id="enrich-only-missing"
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
              disabled={loading}
              className="h-4 w-4"
            />
            <div>
              <Label htmlFor="enrich-only-missing" className="cursor-pointer">
                Jen osoby bez příběhu
              </Label>
              <p className="text-xs text-muted-foreground">
                {onlyMissing
                  ? `${missingStories} z ${totalPersons} osob nemá příběh`
                  : `Přepíše příběhy u všech ${totalPersons} osob`}
              </p>
            </div>
          </div>
          <div className="text-sm font-medium">
            Bude zpracováno: {count} osob
            <span className="text-muted-foreground text-xs ml-1.5">
              (odhad: {estimateTime(count)})
            </span>
          </div>
          {count > 100 && !loading && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
              Větší populace bude zpracována automaticky po dávkách. Průběh můžete sledovat níže.
            </p>
          )}

          {/* Progress bar */}
          {loading && progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Zpracováno {progress.done} / {progress.total}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-primary/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(progressPct, 2)}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              {loading ? 'Probíhá…' : 'Zrušit'}
            </Button>
            <Button type="submit" disabled={loading || count === 0}>
              {loading ? `Generuji… (${progressPct}%)` : `Generovat (${count})`}
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

/** Color for PIAAC score badge based on value */
function piaacScoreColor(score: number): string {
  if (score < 176) return 'bg-red-500/15 text-red-700 border-red-200'       // Pod úrovní 1
  if (score < 226) return 'bg-orange-500/15 text-orange-700 border-orange-200' // Úroveň 1
  if (score < 276) return 'bg-amber-500/15 text-amber-700 border-amber-200'   // Úroveň 2
  if (score < 326) return 'bg-emerald-500/15 text-emerald-700 border-emerald-200' // Úroveň 3
  if (score < 376) return 'bg-blue-500/15 text-blue-700 border-blue-200'     // Úroveň 4
  return 'bg-purple-500/15 text-purple-700 border-purple-200'                // Úroveň 5
}

/** Short level label for PIAAC */
function piaacLevelLabel(score: number): string {
  if (score < 176) return '<1'
  if (score < 226) return 'L1'
  if (score < 276) return 'L2'
  if (score < 326) return 'L3'
  if (score < 376) return 'L4'
  return 'L5'
}

// ── Chart colors ─────────────────────────────────────────────────────────

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#2563eb',
]

const PIAAC_COLORS: Record<string, string> = {
  '<1': '#ef4444', 'L1': '#f97316', 'L2': '#eab308',
  'L3': '#22c55e', 'L4': '#3b82f6', 'L5': '#8b5cf6',
}

// ── Population charts ───────────────────────────────────────────────────

function countBy(persons: Person[], accessor: (p: Person) => string): { name: string; count: number }[] {
  const map = new Map<string, number>()
  for (const p of persons) {
    const v = accessor(p) || '–'
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

function ageHistogram(persons: Person[]): { name: string; count: number }[] {
  const buckets: Record<string, number> = {}
  for (const p of persons) {
    const bucket = `${Math.floor(p.age / 10) * 10}–${Math.floor(p.age / 10) * 10 + 9}`
    buckets[bucket] = (buckets[bucket] ?? 0) + 1
  }
  return Object.entries(buckets)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function piaacDistribution(persons: Person[]): { name: string; count: number; color: string }[] {
  const levels = ['<1', 'L1', 'L2', 'L3', 'L4', 'L5']
  const counts: Record<string, number> = {}
  for (const l of levels) counts[l] = 0
  for (const p of persons) {
    const score = p.demographics?.piaac_score ?? computeExpectedScore(p)
    const label = piaacLevelLabel(score)
    counts[label] = (counts[label] ?? 0) + 1
  }
  return levels.map((l) => ({ name: l, count: counts[l] ?? 0, color: PIAAC_COLORS[l] ?? '#999' }))
}

function MiniBarChart({
  title,
  data,
  colorByName,
}: {
  title: string
  data: { name: string; count: number; color?: string }[]
  colorByName?: boolean
}) {
  if (data.length === 0) return null
  return (
    <div className="border rounded-lg p-3 space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <ResponsiveContainer width="100%" height={Math.max(100, data.length * 24 + 20)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => [`${value} osob`, 'Počet']}
            contentStyle={{ fontSize: 11, borderRadius: 8 }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? (colorByName ? CHART_COLORS[i % CHART_COLORS.length] : '#6366f1')} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MiniPieChart({
  title,
  data,
}: {
  title: string
  data: { name: string; count: number; color?: string }[]
}) {
  if (data.length === 0) return null
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <div className="border rounded-lg p-3 space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="flex items-center gap-3">
        <ResponsiveContainer width={90} height={90}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={40}
              innerRadius={20}
              strokeWidth={1}
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [`${value} (${Math.round(value / total * 100)}%)`, '']}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-0.5">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="text-muted-foreground">{d.name}</span>
              <span className="font-medium">{Math.round(d.count / total * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PopulationCharts({ persons }: { persons: Person[] }) {
  const genderData = countBy(persons, (p) => p.gender)
  const educationData = countBy(persons, (p) => displayVal(p.demographics?.education))
  const employmentData = countBy(persons, (p) => displayVal(p.demographics?.employment_status))
  const incomeData = countBy(persons, (p) => displayVal(p.demographics?.income_level))
  const regionData = countBy(persons, (p) => displayVal(p.demographics?.region))
  const ageData = ageHistogram(persons)
  const piaacData = piaacDistribution(persons)

  return (
    <div className="p-4 space-y-3 border-b bg-muted/5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniPieChart title="Pohlaví" data={genderData.map((d, i) => ({ ...d, color: i === 0 ? '#3b82f6' : '#ec4899' }))} />
        <MiniBarChart title="Věk" data={ageData} />
        <MiniBarChart title="PIAAC úroveň" data={piaacData} />
        <MiniPieChart title="Příjem" data={incomeData.map((d, i) => ({ ...d, color: CHART_COLORS[i % CHART_COLORS.length]! }))} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MiniBarChart title="Vzdělání" data={educationData} colorByName />
        <MiniBarChart title="Zaměstnanecký status" data={employmentData} colorByName />
        <MiniBarChart title="Kraj" data={regionData} colorByName />
      </div>
    </div>
  )
}

// ── Column filter helper ─────────────────────────────────────────────────

/** Extract unique non-empty values for a column from persons array */
function uniqueValues(persons: Person[], accessor: (p: Person) => string | undefined): string[] {
  const set = new Set<string>()
  for (const p of persons) {
    const v = accessor(p)
    if (v && v !== '–') set.add(v)
  }
  return [...set].sort()
}

/** Filterable column header — dropdown with unique values */
function FilterHeader({
  label,
  values,
  selected,
  onChange,
  icon,
}: {
  label: string
  values: string[]
  selected: string
  onChange: (v: string) => void
  icon?: React.ReactNode
}) {
  const hasFilter = selected !== ''
  return (
    <th className="text-left px-3 py-1 font-medium whitespace-nowrap align-top">
      <div className="space-y-0.5">
        <span className="flex items-center gap-1">
          {icon}
          {label}
          {hasFilter && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
        </span>
        {values.length > 1 && (
          <select
            value={selected}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-5 text-[10px] font-normal bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none cursor-pointer text-muted-foreground appearance-none"
            title={`Filtrovat podle ${label.toLowerCase()}`}
          >
            <option value="">vše</option>
            {values.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}
      </div>
    </th>
  )
}

function PersonsTable({ persons }: { persons: Person[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})

  function setFilter(key: string, value: string) {
    setFilters((prev) => {
      const next = { ...prev }
      if (value === '') delete next[key]
      else next[key] = value
      return next
    })
  }

  // Compute unique values for filter dropdowns
  const genderOpts = uniqueValues(persons, (p) => p.gender)
  const educationOpts = uniqueValues(persons, (p) => p.demographics?.education)
  const maritalOpts = uniqueValues(persons, (p) => p.demographics?.marital_status)
  const partnerOpts = ['Ano', 'Ne']
  const employmentOpts = uniqueValues(persons, (p) => p.demographics?.employment_status)
  const incomeOpts = uniqueValues(persons, (p) => p.demographics?.income_level)
  const regionOpts = uniqueValues(persons, (p) => p.demographics?.region)
  const piaacLevelOpts = ['<1', 'L1', 'L2', 'L3', 'L4', 'L5']
  const storyOpts = ['Ano', 'Ne']

  // Apply filters
  const filtered = persons.filter((p) => {
    if (filters['gender'] && p.gender !== filters['gender']) return false
    if (filters['education'] && displayVal(p.demographics?.education) !== filters['education']) return false
    if (filters['marital'] && displayVal(p.demographics?.marital_status) !== filters['marital']) return false
    if (filters['partner']) {
      const val = p.demographics?.has_partner ? 'Ano' : 'Ne'
      if (val !== filters['partner']) return false
    }
    if (filters['employment'] && displayVal(p.demographics?.employment_status) !== filters['employment']) return false
    if (filters['income'] && displayVal(p.demographics?.income_level) !== filters['income']) return false
    if (filters['region'] && displayVal(p.demographics?.region) !== filters['region']) return false
    if (filters['piaac']) {
      const score = p.demographics?.piaac_score ?? computeExpectedScore(p)
      if (piaacLevelLabel(score) !== filters['piaac']) return false
    }
    if (filters['story']) {
      const hasStory = !!p.life_story
      if (filters['story'] === 'Ano' && !hasStory) return false
      if (filters['story'] === 'Ne' && hasStory) return false
    }
    return true
  })

  const activeFilterCount = Object.keys(filters).length
  const isFiltered = activeFilterCount > 0

  return (
    <div className="overflow-x-auto">
      {/* Filter status bar */}
      {isFiltered && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-primary/5 border-b text-xs">
          <span className="text-muted-foreground">
            Zobrazeno <strong className="text-foreground">{filtered.length}</strong> z {persons.length} osob
            ({activeFilterCount} {activeFilterCount === 1 ? 'filtr' : activeFilterCount < 5 ? 'filtry' : 'filtrů'})
          </span>
          <button
            className="text-primary hover:underline text-xs"
            onClick={() => setFilters({})}
          >
            Zrušit filtry
          </button>
        </div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50 sticky top-0 z-10">
            <th className="w-6 px-3 py-1" />
            <th className="text-left px-3 py-1 font-medium whitespace-nowrap align-top">ID</th>
            <th className="text-left px-3 py-1 font-medium whitespace-nowrap align-top">Věk</th>
            <FilterHeader label="Pohlaví" values={genderOpts} selected={filters['gender'] ?? ''} onChange={(v) => setFilter('gender', v)} />
            <FilterHeader label="Vzdělání" values={educationOpts} selected={filters['education'] ?? ''} onChange={(v) => setFilter('education', v)} />
            <FilterHeader label="Stav" values={maritalOpts} selected={filters['marital'] ?? ''} onChange={(v) => setFilter('marital', v)} />
            <FilterHeader label="Partner" values={partnerOpts} selected={filters['partner'] ?? ''} onChange={(v) => setFilter('partner', v)} />
            <FilterHeader label="Status" values={employmentOpts} selected={filters['employment'] ?? ''} onChange={(v) => setFilter('employment', v)} />
            <FilterHeader label="Příjem" values={incomeOpts} selected={filters['income'] ?? ''} onChange={(v) => setFilter('income', v)} />
            <FilterHeader label="Kraj" values={regionOpts} selected={filters['region'] ?? ''} onChange={(v) => setFilter('region', v)} />
            <FilterHeader label="PIAAC" values={piaacLevelOpts} selected={filters['piaac'] ?? ''} onChange={(v) => setFilter('piaac', v)} icon={<Brain className="h-3 w-3" />} />
            <FilterHeader label="Příběh" values={storyOpts} selected={filters['story'] ?? ''} onChange={(v) => setFilter('story', v)} />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                Žádné osoby neodpovídají zvoleným filtrům.
              </td>
            </tr>
          )}
          {filtered.map((p) => {
            const isExpanded = expandedId === p.id
            const hasStory = !!p.life_story
            const piaacScore = p.demographics?.piaac_score ?? computeExpectedScore(p)
            const isEstimated = p.demographics?.piaac_score == null
            return (
              <>
                <tr
                  key={p.id}
                  className={`border-b hover:bg-muted/20 cursor-pointer transition-colors ${isExpanded ? 'bg-muted/30' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                >
                  <td className="px-3 py-2 text-muted-foreground">
                    <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{p.id.substring(0, 8)}…</td>
                  <td className="px-3 py-2">{p.age}</td>
                  <td className="px-3 py-2">{p.gender}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.education)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.marital_status)}</td>
                  <td className="px-3 py-2">{displayVal(p.demographics?.has_partner)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.employment_status)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.income_level)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{displayVal(p.demographics?.region)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border tabular-nums ${piaacScoreColor(piaacScore)}`}
                      title={`${isEstimated ? 'Odhad: ' : ''}${Math.round(piaacScore)} bodů (${scoreToLevel(Math.round(piaacScore))})`}
                    >
                      {Math.round(piaacScore)}
                      <span className="opacity-60">{piaacLevelLabel(piaacScore)}</span>
                      {isEstimated && <span className="opacity-40">~</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {hasStory
                      ? <Sparkles className="h-3 w-3 text-amber-500 mx-auto" aria-label="Má životní příběh" />
                      : <span className="text-muted-foreground/40">–</span>}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${p.id}-detail`} className="border-b bg-muted/10">
                    <td colSpan={12} className="px-6 py-4">
                      <div className="space-y-3">
                        {/* Full ID */}
                        <div className="flex gap-2 text-xs">
                          <span className="text-muted-foreground w-24 flex-shrink-0">ID</span>
                          <span className="font-mono">{p.id}</span>
                        </div>
                        {/* PIAAC score detail */}
                        <div className="flex gap-2 text-xs items-center">
                          <span className="text-muted-foreground w-24 flex-shrink-0">PIAAC skóre</span>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${piaacScoreColor(piaacScore)}`}>
                            <Brain className="h-3 w-3" />
                            {Math.round(piaacScore)} bodů — {scoreToLevel(Math.round(piaacScore))}
                          </span>
                          {isEstimated && (
                            <span className="text-muted-foreground italic">
                              (odhad z demografik, přiřadí se při simulaci)
                            </span>
                          )}
                        </div>
                        {/* Custom fields */}
                        {p.demographics?.custom_fields && Object.keys(p.demographics.custom_fields).length > 0 && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground w-24 flex-shrink-0">Vlastní pole</span>
                            <span className="text-muted-foreground">
                              {Object.entries(p.demographics.custom_fields)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' · ')}
                            </span>
                          </div>
                        )}
                        {/* Life story */}
                        <div className="flex gap-2 text-xs">
                          <span className="text-muted-foreground w-24 flex-shrink-0 flex items-start gap-1">
                            {hasStory && <Sparkles className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />}
                            Životní příběh
                          </span>
                          {hasStory
                            ? <p className="text-foreground leading-relaxed max-w-2xl">{p.life_story}</p>
                            : <span className="text-muted-foreground italic">Příběh nebyl vygenerován. Použijte tlačítko „AI příběhy".</span>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
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
  const [enrichOpen, setEnrichOpen] = useState(false)
  const [enrichResult, setEnrichResult] = useState<{ enriched: number; failed: number } | null>(null)
  const [missingStories, setMissingStories] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewMode, setViewMode] = useState<'table' | 'charts'>('table')
  const [allPersons, setAllPersons] = useState<Person[] | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)

  useEffect(() => {
    if (!population) return
    let cancelled = false
    setLoadingPersons(true)
    setPersonsError(null)
    getPersons(population.id, offset, PAGE_SIZE)
      .then((page) => {
        if (!cancelled) {
          setPersons(page.persons)
          setTotal(page.total)
          if (offset === 0) {
            const missingOnPage = page.persons.filter((p) => !p.life_story).length
            const ratio = page.persons.length > 0 ? missingOnPage / page.persons.length : 0
            setMissingStories(Math.round(ratio * page.total))
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setPersonsError(err instanceof Error ? err.message : 'Chyba při načítání osob.')
      })
      .finally(() => { if (!cancelled) setLoadingPersons(false) })
    return () => { cancelled = true }
  }, [population, offset, refreshKey])

  // Load all persons when switching to chart view
  useEffect(() => {
    if (viewMode !== 'charts' || !population || allPersons !== null) return
    let cancelled = false
    setLoadingAll(true)
    getPersons(population.id, 0, 2000)
      .then((page) => { if (!cancelled) setAllPersons(page.persons) })
      .catch(() => { /* fallback to page data */ })
      .finally(() => { if (!cancelled) setLoadingAll(false) })
    return () => { cancelled = true }
  }, [viewMode, population, allPersons])

  function handleClose() {
    setPersons([]); setTotal(0); setOffset(0); setPersonsError(null)
    setEnrichResult(null); setMissingStories(0); setRefreshKey(0)
    setViewMode('table'); setAllPersons(null); setLoadingAll(false)
    onClose()
  }

  function handleEnriched(result: { enriched: number; failed: number }) {
    setEnrichOpen(false)
    setEnrichResult(result)
    setOffset(0)
    setRefreshKey((k) => k + 1)
    onPopulationChanged()
  }

  function handleGenerated() {
    setGenerateOpen(false)
    setOffset(0)
    setRefreshKey((k) => k + 1)
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
              <div className="flex gap-2 flex-shrink-0">
                {/* View mode toggle */}
                <div className="flex border rounded-md overflow-hidden">
                  <button
                    className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                    onClick={() => setViewMode('table')}
                  >
                    <Table2 className="h-3.5 w-3.5" /> Tabulka
                  </button>
                  <button
                    className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${viewMode === 'charts' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                    onClick={() => setViewMode('charts')}
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Grafy
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
                  <Wand2 className="h-4 w-4 mr-1.5" />
                  Generovat osoby
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEnrichOpen(true)} disabled={total === 0}>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Generovat příběhy (AI)
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Enrich result banner */}
          {enrichResult && (
            <div className="px-6 py-2 bg-green-50 border-b border-green-200 flex items-center justify-between">
              <p className="text-sm text-green-800">
                ✓ Vygenerováno {enrichResult.enriched} životních příběhů
                {enrichResult.failed > 0 && ` (${enrichResult.failed} selhalo)`}
              </p>
              <button className="text-xs text-green-600 underline" onClick={() => setEnrichResult(null)}>
                Zavřít
              </button>
            </div>
          )}

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
            {!loadingPersons && persons.length > 0 && viewMode === 'table' && (
              <PersonsTable persons={persons} />
            )}
            {viewMode === 'charts' && (
              loadingAll
                ? <p className="text-sm text-muted-foreground px-6 py-8 text-center">Načítám data pro grafy…</p>
                : (allPersons ?? persons).length > 0
                  ? <PopulationCharts persons={allPersons ?? persons} />
                  : null
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

      {/* Sub-dialogs — siblings to avoid nested portal focus-trap conflict */}
      {population && (
        <GenerateDialog
          populationId={population.id}
          open={generateOpen}
          onClose={() => setGenerateOpen(false)}
          onGenerated={handleGenerated}
        />
      )}
      {population && (
        <EnrichDialog
          populationId={population.id}
          totalPersons={population.person_count}
          missingStories={missingStories}
          open={enrichOpen}
          onClose={() => setEnrichOpen(false)}
          onEnriched={handleEnriched}
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

      {loading && <p className="text-muted-foreground text-sm">Načítám populace… (první načtení může trvat až 30 s)</p>}
      {fetchError && (
        <div className="flex items-center gap-3">
          <p className="text-destructive text-sm">{fetchError}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>Zkusit znovu</Button>
        </div>
      )}

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
