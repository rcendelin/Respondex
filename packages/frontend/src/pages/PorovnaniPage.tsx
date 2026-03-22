import { useState, useEffect, useCallback } from 'react'
import { FlaskConical, Trophy, AlertTriangle, Plus, Loader2 } from 'lucide-react'
import type { ABTestConfig, ABTestComparison, PairwiseComparison, SimulationMeta } from '@respondex/shared'
import { SimulationStatus } from '@respondex/shared'
import {
  getABTests, getABTestResults, createABTest,
  getSimulations, type SimulationListItem,
} from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const FIDELITY_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2']

const VARIANCE_LABELS: Record<string, string> = {
  standard: 'Standardní',
  enhanced: 'Rozšířený',
  two_step: 'Dvoustupňový',
  numeracy_behavioral: 'PIAAC Behaviorální',
  irt_modulated: 'IRT Modulace',
  dlce: 'DLCE Kalibrace',
}

function varianceLabel(mode?: string): string {
  return VARIANCE_LABELS[mode ?? 'standard'] ?? mode ?? 'standard'
}

// ── Create A/B Test Dialog ───────────────────────────────────────────────

function CreateTestDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [simulations, setSimulations] = useState<SimulationListItem[]>([])
  const [selectedSimIds, setSelectedSimIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      getSimulations()
        .then((sims) => setSimulations(sims.filter((s) => s.status === SimulationStatus.COMPLETED)))
        .catch(() => setSimulations([]))
      setSelectedSimIds(new Set())
      setName('')
      setError(null)
    }
  }, [open])

  const toggleSim = (id: string) => {
    setSelectedSimIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreate = async () => {
    if (!name.trim()) { setError('Zadejte název testu'); return }
    if (selectedSimIds.size < 2) { setError('Vyberte alespoň 2 simulace k porovnání'); return }

    const selected = simulations.filter((s) => selectedSimIds.has(s.id))
    // All selected simulations must share the same population and questionnaire
    const popIds = new Set(selected.map((s) => s.config.population_id))
    const qIds = new Set(selected.map((s) => s.config.questionnaire_id))
    if (popIds.size > 1) { setError('Vybrané simulace musí používat stejnou populaci'); return }
    if (qIds.size > 1) { setError('Vybrané simulace musí používat stejný dotazník'); return }

    setLoading(true)
    setError(null)
    try {
      const arms = selected.map((s) => ({
        name: varianceLabel(s.config.variance_mode) + ` (${s.id.substring(0, 8)})`,
        variance_mode: s.config.variance_mode ?? 'standard',
        simulation_id: s.id,
      }))
      const first = selected[0]!
      await createABTest({
        name: name.trim(),
        population_id: first.config.population_id,
        questionnaire_id: first.config.questionnaire_id,
        arms,
        simulation_ids: selected.map((s) => s.id),
      })
      setLoading(false)
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba při vytváření testu')
      setLoading(false)
    }
  }

  // Group simulations by variance_mode for display
  const grouped = simulations.reduce((acc, sim) => {
    const mode = sim.config.variance_mode ?? 'standard'
    if (!acc[mode]) acc[mode] = []
    acc[mode].push(sim)
    return acc
  }, {} as Record<string, SimulationListItem[]>)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nový A/B test</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="test-name">Název testu</Label>
            <Input
              id="test-name"
              placeholder="např. Porovnání algoritmů — numeracy dotazník"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <Label>Vyberte simulace k porovnání (min. 2)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Simulace musí sdílet stejnou populaci a dotazník. První vybraná bude baseline.
            </p>

            {simulations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Žádné dokončené simulace. Nejprve spusťte simulace s různými variance módy.
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto border rounded-md p-3">
                {Object.entries(grouped).map(([mode, sims]) => (
                  <div key={mode}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {varianceLabel(mode)}
                    </p>
                    {sims.map((sim) => (
                      <label
                        key={sim.id}
                        className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-accent cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSimIds.has(sim.id)}
                          onChange={() => toggleSim(sim.id)}
                          disabled={loading}
                          className="rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-mono">{sim.id.substring(0, 12)}...</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {sim.config.model} · temp {sim.config.temperature} · {sim.config.runs_per_person}× per osobu
                          </span>
                        </div>
                        <Badge variant={selectedSimIds.has(sim.id) ? 'default' : 'outline'} className="text-xs shrink-0">
                          {varianceLabel(sim.config.variance_mode)}
                        </Badge>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedSimIds.size > 0 && (
            <p className="text-xs text-muted-foreground">
              Vybráno: {selectedSimIds.size} simulací.
              Baseline: první vybraná ({varianceLabel(simulations.find((s) => selectedSimIds.has(s.id))?.config.variance_mode)}).
            </p>
          )}

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Zrušit</Button>
          <Button onClick={handleCreate} disabled={loading || selectedSimIds.size < 2}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Vytvořit a porovnat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Result cards ─────────────────────────────────────────────────────────

function RankingCard({ ranking }: { ranking: ABTestComparison['ranking'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Pořadí algoritmů (Fidelity Score)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(150, ranking.length * 50)}>
          <BarChart data={ranking} layout="vertical" margin={{ left: 20, right: 40 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="arm_name" width={200} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(val: number) => [`${val.toFixed(1)}`, 'Fidelity']} />
            <Bar dataKey="mean_fidelity" radius={[0, 4, 4, 0]}>
              {ranking.map((_entry, i) => (
                <Cell key={i} fill={FIDELITY_COLORS[i % FIDELITY_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function PairwiseCard({ comparisons }: { comparisons: PairwiseComparison[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Srovnání s baseline</CardTitle>
        <p className="text-xs text-muted-foreground">Kladná delta = lepší než baseline</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-medium">Algoritmus</th>
              <th className="py-2 pr-3 font-medium text-right">Fidelity delta</th>
              <th className="py-2 pr-3 font-medium text-right">95% CI</th>
              <th className="py-2 pr-2 font-medium text-center">Lepší</th>
              <th className="py-2 pr-2 font-medium text-center">Stejné</th>
              <th className="py-2 font-medium text-center">Horší</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.arm_id} className="border-b last:border-0">
                <td className="py-1.5 pr-3 text-xs font-medium">{c.arm_name}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs">
                  <span className={c.fidelity_delta > 0 ? 'text-green-600' : c.fidelity_delta < 0 ? 'text-red-600' : ''}>
                    {c.fidelity_delta > 0 ? '+' : ''}{c.fidelity_delta.toFixed(1)}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs text-muted-foreground">
                  [{c.fidelity_ci_lower.toFixed(1)}, {c.fidelity_ci_upper.toFixed(1)}]
                </td>
                <td className="py-1.5 pr-2 text-center">
                  <Badge variant="outline" className="text-xs text-green-600">{c.questions_improved}</Badge>
                </td>
                <td className="py-1.5 pr-2 text-center">
                  <Badge variant="outline" className="text-xs">{c.questions_tied}</Badge>
                </td>
                <td className="py-1.5 text-center">
                  <Badge variant="outline" className="text-xs text-red-600">{c.questions_degraded}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function DivergentQuestionsCard({ questions }: { questions: ABTestComparison['divergent_questions'] }) {
  if (questions.length === 0) return null
  const arms = Object.keys(questions[0]?.arm_scores ?? {})

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Otázky s největším rozdílem mezi algoritmy
        </CardTitle>
        <p className="text-xs text-muted-foreground">JSD skóre — nižší = bližší realitě</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-medium">Otázka</th>
              {arms.map((arm) => (
                <th key={arm} className="py-2 pr-2 font-medium text-right">{arm}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => {
              const scores = Object.values(q.arm_scores)
              const minScore = Math.min(...scores)
              return (
                <tr key={q.question_id} className="border-b last:border-0">
                  <td className="py-1 pr-3 max-w-64 truncate">{q.question_text}</td>
                  {arms.map((arm) => {
                    const score = q.arm_scores[arm] ?? 0
                    const isBest = Math.abs(score - minScore) < 0.005
                    return (
                      <td key={arm} className="py-1 pr-2 text-right font-mono">
                        <span className={isBest ? 'text-green-600 font-bold' : ''}>
                          {score.toFixed(3)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ── Main page ────────────────────────────────────────────────────────────

export function PorovnaniPage() {
  const [tests, setTests] = useState<ABTestConfig[]>([])
  const [selectedTestId, setSelectedTestId] = useState<string>('')
  const [comparison, setComparison] = useState<ABTestComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)

  const loadTests = useCallback(() => {
    getABTests().then(setTests).catch(() => setTests([]))
  }, [])

  useEffect(() => { loadTests() }, [loadTests])

  useEffect(() => {
    if (!selectedTestId) { setComparison(null); return }
    setLoading(true)
    setError('')
    getABTestResults(selectedTestId)
      .then((r) => { setComparison(r); setLoading(false) })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Chyba'); setLoading(false) })
  }, [selectedTestId])

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold tracking-tight">Porovnání algoritmů</h2>
          <p className="text-sm text-muted-foreground">
            A/B testování simulačních strategií proti reálným datům
          </p>
        </div>
        <Button className="ml-auto" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nový A/B test
        </Button>
      </div>

      <CreateTestDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { loadTests(); setShowCreate(false) }}
      />

      {tests.length === 0 && !showCreate ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Zatím žádné A/B testy</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Nejprve spusťte simulace s různými variance módy na stránce Simulace,
              pak zde klikněte „Nový A/B test" a vyberte simulace k porovnání.
            </p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Vytvořit první A/B test
            </Button>
          </CardContent>
        </Card>
      ) : tests.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <Select value={selectedTestId} onValueChange={setSelectedTestId}>
              <SelectTrigger className="w-96">
                <SelectValue placeholder="Vyberte A/B test..." />
              </SelectTrigger>
              <SelectContent>
                {tests.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    <span className="text-muted-foreground ml-2">({t.arms.length} ramen)</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>
          )}

          {comparison && (
            <Tabs defaultValue="ranking">
              <TabsList>
                <TabsTrigger value="ranking">Pořadí</TabsTrigger>
                <TabsTrigger value="pairwise">Srovnání</TabsTrigger>
                <TabsTrigger value="divergent">Divergence</TabsTrigger>
              </TabsList>

              <TabsContent value="ranking" className="mt-4">
                <RankingCard ranking={comparison.ranking} />
              </TabsContent>

              <TabsContent value="pairwise" className="mt-4">
                <PairwiseCard comparisons={comparison.pairwise} />
              </TabsContent>

              <TabsContent value="divergent" className="mt-4">
                <DivergentQuestionsCard questions={comparison.divergent_questions} />
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </div>
  )
}
