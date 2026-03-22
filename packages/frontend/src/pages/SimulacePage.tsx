import { useState, useEffect, useCallback, useRef } from 'react'
import { PlayCircle, Plus, Trash2 } from 'lucide-react'
import { Strategy, SimulationStatus, SupportedModel, VarianceMode } from '@respondex/shared'
import {
  getPopulations, getQuestionnaires, getSimulations, startSimulation,
  deleteSimulation, getSimulationStatus,
  type PopulationListItem, type QuestionnaireListItem, type SimulationListItem,
} from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Input } from '../components/ui/input'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function statusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  switch (status) {
    case SimulationStatus.PENDING: return { label: 'Čeká', variant: 'secondary' }
    case SimulationStatus.RUNNING: return { label: 'Probíhá', variant: 'default' }
    case SimulationStatus.COMPLETED: return { label: 'Dokončeno', variant: 'outline' }
    case SimulationStatus.FAILED: return { label: 'Chyba', variant: 'destructive' }
    case SimulationStatus.PARTIAL_FAILURE: return { label: 'Částečná chyba', variant: 'destructive' }
    default: return { label: status, variant: 'secondary' }
  }
}

// ── New simulation dialog ──────────────────────────────────────────────────

interface NewSimDialogProps {
  open: boolean
  onClose: () => void
  onStarted: () => void
}

function NewSimulationDialog({ open, onClose, onStarted }: NewSimDialogProps) {
  const [populations, setPopulations] = useState<PopulationListItem[]>([])
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireListItem[]>([])
  const [populationId, setPopulationId] = useState('')
  const [questionnaireId, setQuestionnaireId] = useState('')
  const [strategy, setStrategy] = useState<string>(Strategy.A)
  const [model, setModel] = useState<string>(SupportedModel.GPT_54_MINI)
  const [temperature, setTemperature] = useState('0.7')
  const [runsPerPerson, setRunsPerPerson] = useState('3')
  const [varianceMode, setVarianceMode] = useState<string>(VarianceMode.ENHANCED)
  const [batchModes, setBatchModes] = useState<Set<string>>(new Set())
  const [batchMode, setBatchMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    Promise.all([getPopulations(), getQuestionnaires()]).then(([pops, qs]) => {
      const popList = Array.isArray(pops)
        ? pops
        : (pops as unknown as { populations: PopulationListItem[] }).populations ?? []
      const qList = Array.isArray(qs)
        ? qs
        : (qs as unknown as { questionnaires: QuestionnaireListItem[] }).questionnaires ?? []
      setPopulations(popList)
      setQuestionnaires(qList)
    }).catch(() => { /* non-critical */ })
  }, [open])

  function reset() {
    setPopulationId(''); setQuestionnaireId(''); setStrategy(Strategy.A)
    setModel(SupportedModel.GPT_54_MINI); setTemperature('0.7'); setRunsPerPerson('3')
    setVarianceMode(VarianceMode.ENHANCED); setBatchModes(new Set()); setBatchMode(false)
    setError(null); setLoading(false); setBatchProgress(null)
  }

  function handleClose() { reset(); onClose() }

  function toggleBatchMode(mode: string) {
    setBatchModes((prev) => {
      const next = new Set(prev)
      if (next.has(mode)) next.delete(mode)
      else next.add(mode)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!populationId) { setError('Vyberte populaci.'); return }
    if (!questionnaireId) { setError('Vyberte dotazník.'); return }
    const temp = parseFloat(temperature)
    const runs = parseInt(runsPerPerson, 10)
    if (isNaN(temp) || temp < 0 || temp > 2) { setError('Teplota musí být 0.0–2.0.'); return }
    if (isNaN(runs) || runs < 1 || runs > 10) { setError('Počet runs musí být 1–10.'); return }

    const modes = batchMode && batchModes.size > 0
      ? [...batchModes]
      : [varianceMode]

    if (modes.length === 0) { setError('Vyberte alespoň jeden režim variability.'); return }

    setLoading(true); setError(null); setBatchProgress({ done: 0, total: modes.length })
    try {
      for (let i = 0; i < modes.length; i++) {
        setBatchProgress({ done: i, total: modes.length })
        await startSimulation({
          population_id: populationId,
          questionnaire_id: questionnaireId,
          strategy: strategy as Strategy,
          model: model as SupportedModel,
          temperature: temp,
          runs_per_person: runs,
          variance_mode: modes[i] as VarianceMode,
        })
      }
      reset(); onStarted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neočekávaná chyba.')
      setLoading(false); setBatchProgress(null)
    }
  }

  const strategyOptions = [
    { value: Strategy.A, label: 'A — Demografický profil' },
    { value: Strategy.C, label: 'C — Narativní (LifeStory)' },
  ]

  const modelOptions = Object.values(SupportedModel).map((m) => ({ value: m, label: m }))

  const varianceModeOptions = [
    { value: VarianceMode.STANDARD, label: 'Standardní (původní)' },
    { value: VarianceMode.ENHANCED, label: 'Rozšířený (kognitivní profily)' },
    { value: VarianceMode.TWO_STEP, label: 'Dvoustupňový (+ probe kompetence)' },
    { value: VarianceMode.NUMERACY_BEHAVIORAL, label: 'PIAAC Behaviorální (Alg. 1)' },
    { value: VarianceMode.IRT_MODULATED, label: 'IRT Modulace (Alg. 2)' },
    { value: VarianceMode.DLCE, label: 'DLCE Kalibrace (Alg. 3)' },
  ]

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nová simulace</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Populace</Label>
            <Select value={populationId} onValueChange={setPopulationId} disabled={loading}>
              <SelectTrigger><SelectValue placeholder="Vyberte populaci…" /></SelectTrigger>
              <SelectContent>
                {populations.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.person_count} osob)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Dotazník</Label>
            <Select value={questionnaireId} onValueChange={setQuestionnaireId} disabled={loading}>
              <SelectTrigger><SelectValue placeholder="Vyberte dotazník…" /></SelectTrigger>
              <SelectContent>
                {questionnaires.map((q) => (
                  <SelectItem key={q.id} value={q.id}>{q.name} ({q.question_count} otázek)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Strategie</Label>
              <Select value={strategy} onValueChange={setStrategy} disabled={loading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {strategyOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel} disabled={loading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="temperature">Teplota (0.0–2.0)</Label>
              <Input id="temperature" type="number" min="0" max="2" step="0.1"
                value={temperature} onChange={(e) => setTemperature(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="runs">Runs per person (1–10)</Label>
              <Input id="runs" type="number" min="1" max="10" step="1"
                value={runsPerPerson} onChange={(e) => setRunsPerPerson(e.target.value)} disabled={loading} />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Režim variability odpovědí</Label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={(e) => setBatchMode(e.target.checked)}
                  disabled={loading}
                  className="rounded border-gray-300"
                />
                <span className="text-xs text-muted-foreground">Více režimů najednou</span>
              </label>
            </div>
            {batchMode ? (
              <div className="space-y-1 border rounded-md p-2">
                {varianceModeOptions.map((v) => (
                  <label key={v.value} className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-accent rounded px-1">
                    <input
                      type="checkbox"
                      checked={batchModes.has(v.value)}
                      onChange={() => toggleBatchMode(v.value)}
                      disabled={loading}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{v.label}</span>
                  </label>
                ))}
                {batchModes.size > 0 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Spustí {batchModes.size} simulací paralelně se stejným nastavením, jen s jiným režimem.
                  </p>
                )}
              </div>
            ) : (
              <Select value={varianceMode} onValueChange={setVarianceMode} disabled={loading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {varianceModeOptions.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Zrušit</Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? batchProgress
                  ? `Spouštím ${batchProgress.done + 1}/${batchProgress.total}…`
                  : 'Spouštím…'
                : batchMode && batchModes.size > 1
                  ? `Spustit ${batchModes.size} simulací`
                  : 'Spustit simulaci'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function SimulacePage() {
  const [simulations, setSimulations] = useState<SimulationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setFetchError(null)
    try {
      const data = await getSimulations()
      const list = Array.isArray(data)
        ? data
        : (data as unknown as { simulations: SimulationListItem[] }).simulations ?? []
      setSimulations(list)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Chyba při načítání simulací.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  // Poll running simulations every 5s
  useEffect(() => {
    const running = simulations.filter((s) => s.status === SimulationStatus.RUNNING)
    if (running.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      const updates = await Promise.allSettled(
        running.map((s) => getSimulationStatus(s.id))
      )
      // Build a lookup map: simulation_id → updated status fields
      const statusMap = new Map<string, typeof updates[number]>()
      running.forEach((s, i) => { statusMap.set(s.id, updates[i]!) })

      setSimulations((prev) =>
        prev.map((s) => {
          const update = statusMap.get(s.id)
          if (!update || update.status !== 'fulfilled') return s
          const st = update.value as { simulation_id?: string; status?: string; total_chunks?: number; completed_chunks?: number; progress_pct?: number }
          // /status returns simulation_id + partial fields — merge into existing sim to keep id/config intact
          return {
            ...s,
            status: (st.status ?? s.status) as typeof s.status,
            total_chunks: st.total_chunks ?? s.total_chunks,
            completed_chunks: st.completed_chunks ?? s.completed_chunks,
            progress_pct: st.progress_pct ?? s.progress_pct,
          }
        })
      )
    }, 5000)
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [simulations])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try { await deleteSimulation(id); void load() }
    catch { /* non-critical */ }
    finally { setDeletingId(null) }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PlayCircle className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Simulace</h2>
        </div>
        <Button size="sm" onClick={() => setNewDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Nová simulace
        </Button>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Načítám simulace…</p>}
      {fetchError && <p className="text-destructive text-sm">{fetchError}</p>}

      {!loading && !fetchError && simulations.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <PlayCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground text-sm">
              Zatím žádné simulace.{' '}
              <button className="underline" onClick={() => setNewDialogOpen(true)}>Spusťte první</button>.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && simulations.length > 0 && (
        <div className="space-y-3">
          {simulations.map((sim) => {
            const { label, variant } = statusLabel(sim.status)
            const pct = sim.total_chunks > 0
              ? Math.round((sim.completed_chunks / sim.total_chunks) * 100)
              : (sim.status === SimulationStatus.COMPLETED ? 100 : 0)
            return (
              <Card key={sim.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={variant}>{label}</Badge>
                        <span className="text-xs text-muted-foreground font-mono">{sim.id.substring(0, 8)}…</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Strategie {sim.config.strategy} · {sim.config.model} · temp {sim.config.temperature}
                        {' '}· {sim.config.runs_per_person}× per osobu
                        {sim.config.variance_mode && sim.config.variance_mode !== 'standard'
                          ? ` · variabilita: ${sim.config.variance_mode}`
                          : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" title="Smazat simulaci"
                        className="text-destructive hover:text-destructive"
                        disabled={deletingId === sim.id || sim.status === SimulationStatus.RUNNING}
                        onClick={() => handleDelete(sim.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  {sim.status === SimulationStatus.RUNNING && (
                    <div className="space-y-1">
                      <Progress value={pct} className="h-1.5" />
                      <p className="text-xs text-muted-foreground">
                        {sim.completed_chunks} / {sim.total_chunks} chunků ({pct}%)
                      </p>
                    </div>
                  )}
                  {sim.status === SimulationStatus.COMPLETED && (
                    <p className="text-xs text-muted-foreground">
                      Dokončeno {sim.completed_at ? formatDate(sim.completed_at) : ''}
                    </p>
                  )}
                  {sim.status === SimulationStatus.FAILED && sim.error && (
                    <p className="text-xs text-destructive">{sim.error}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <NewSimulationDialog open={newDialogOpen} onClose={() => setNewDialogOpen(false)}
        onStarted={() => { setNewDialogOpen(false); void load() }} />
    </div>
  )
}
