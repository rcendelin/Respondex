import { useState, useEffect } from 'react'
import { FlaskConical, Trophy, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ABTestConfig, ABTestComparison, PairwiseComparison } from '@respondex/shared'
import { getABTests, getABTestResults } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'

const FIDELITY_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2']

// ── Subcomponents ──────────────────────────────────────────────────────

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
        <ResponsiveContainer width="100%" height={Math.max(150, ranking.length * 40)}>
          <BarChart data={ranking} layout="vertical" margin={{ left: 20, right: 40 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="arm_name" width={180} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(val: number) => [`${val.toFixed(1)}`, 'Fidelity']}
            />
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
        <p className="text-xs text-muted-foreground">
          Kladná delta = lepší než baseline
        </p>
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
        <p className="text-xs text-muted-foreground">
          JSD skóre — nižší = bližší realitě
        </p>
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

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">Zatím žádné A/B testy</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          A/B testy porovnávají různé simulační algoritmy proti reálným datům z ESS a CVVM.
          Spusťte simulace s různými variance módy (STANDARD, NUMERACY_BEHAVIORAL, IRT_MODULATED, DLCE)
          a poté zde vytvořte srovnání.
        </p>
      </CardContent>
    </Card>
  )
}

// ── Main page ──────────────────────────────────────────────────────────

export function PorovnaniPage() {
  const [tests, setTests] = useState<ABTestConfig[]>([])
  const [selectedTestId, setSelectedTestId] = useState<string>('')
  const [comparison, setComparison] = useState<ABTestComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    getABTests().then(setTests).catch(() => setTests([]))
  }, [])

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
      </div>

      {tests.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Test selector */}
          <div className="flex items-center gap-3">
            <Select value={selectedTestId} onValueChange={setSelectedTestId}>
              <SelectTrigger className="w-80">
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
            {loading && <span className="text-sm text-muted-foreground">Načítání výsledků...</span>}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </div>
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
