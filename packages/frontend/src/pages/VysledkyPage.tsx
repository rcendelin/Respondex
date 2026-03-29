import React, { useState, useEffect, useCallback } from 'react'
import { BarChart2, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { SimulationStatus } from '@respondex/shared'
import type { AnalyticsResult, FrequencyTable, CrossTab, PromptLog } from '@respondex/shared'
import {
  getSimulations, getAnalyticsSummary, getCrossTabs, exportAnalyticsXlsx, getPromptLogs,
  type SimulationListItem,
} from '../lib/api'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ── Constants ──────────────────────────────────────────────────────────────

const GROUP_BY_OPTIONS = [
  { value: 'Pohlavi', label: 'Pohlaví' },
  { value: 'VekovaSkupina', label: 'Věková skupina' },
  { value: 'Vzdelani', label: 'Vzdělání' },
  { value: 'Region', label: 'Region' },
  { value: 'Zamestnani', label: 'Zaměstnání' },
  { value: 'RodinnyStav', label: 'Rodinný stav' },
  { value: 'PrijmoveRozpeti', label: 'Příjmové rozpětí' },
]

const CHART_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#65a30d']

// ── Frequency chart ────────────────────────────────────────────────────────

const MAX_CHART_ENTRIES = 10

function FrequencyChartCard({ table }: { table: FrequencyTable }) {
  const sorted = [...table.entries].sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, MAX_CHART_ENTRIES)
  const rest = sorted.slice(MAX_CHART_ENTRIES)
  const restCount = rest.reduce((s, e) => s + e.count, 0)
  const restPct = rest.reduce((s, e) => s + e.percentage, 0)

  const data = top.map((e) => ({
    name: String(e.value).length > 20 ? String(e.value).substring(0, 20) + '…' : String(e.value),
    count: e.count,
    pct: e.percentage,
  }))
  if (rest.length > 0) {
    data.push({ name: `Ostatní (${rest.length})`, count: restCount, pct: Math.round(restPct * 10) / 10 })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{table.question_text}</CardTitle>
        <p className="text-xs text-muted-foreground">
          N={table.valid_responses} platných z {table.total_responses} celkem
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground">Žádná data.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, data.length * 28)}>
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 40 }}>
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(val: number) => [`${val}%`, 'Podíl']}
                labelStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                {data.map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ── Cross-tab table ────────────────────────────────────────────────────────

function CrossTabCard({ tab }: { tab: CrossTab }) {
  if (tab.rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{tab.question_text}</CardTitle>
        </CardHeader>
        <CardContent><p className="text-xs text-muted-foreground">Žádná data.</p></CardContent>
      </Card>
    )
  }

  const groupValues = tab.rows[0]?.cells.map((c) => c.group_value) ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{tab.question_text}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2 font-medium">Odpověď</th>
              {groupValues.map((g) => (
                <th key={g} className="text-right px-4 py-2 font-medium">{g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tab.rows.map((row) => (
              <tr key={row.answer_value} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{row.answer_value}</td>
                {row.cells.map((cell) => (
                  <td key={cell.group_value} className="px-4 py-2 text-right tabular-nums">
                    {cell.percentage}%
                    <span className="text-muted-foreground ml-1">({cell.count})</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ── Raw data table ─────────────────────────────────────────────────────────

function RawDataTab({ analytics }: { analytics: AnalyticsResult }) {
  // Reconstruct a flat view from frequency tables (raw responses not returned by summary endpoint)
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Souhrn odpovědí dle otázek. Pro kompletní raw data použijte XLSX export.
      </p>
      {analytics.frequency_tables.map((table) => (
        <Card key={table.question_id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{table.question_text}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Hodnota</th>
                  <th className="text-right px-4 py-2 font-medium">Počet</th>
                  <th className="text-right px-4 py-2 font-medium">Podíl</th>
                </tr>
              </thead>
              <tbody>
                {table.entries.map((e) => (
                  <tr key={String(e.value)} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2">{String(e.value)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{e.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{e.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Prompt logs tab ───────────────────────────────────────────────────────

const PAGE_SIZE = 50

function LogyTab({ simulationId }: { simulationId: string }) {
  const [logs, setLogs] = useState<PromptLog[]>([])
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const loadPage = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const result = await getPromptLogs(simulationId, p, PAGE_SIZE)
      setLogs(result.logs)
      setTotalPages(result.total_pages)
      setTotal(result.total)
      setPage(p)
      setExpandedIdx(null)
    } catch { /* non-critical */ }
    finally { setLoading(false) }
  }, [simulationId])

  useEffect(() => { void loadPage(0) }, [loadPage])

  const filtered = filter
    ? logs.filter(l =>
        l.person_id.includes(filter) ||
        l.question_id.includes(filter)
      )
    : logs

  if (!loading && total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Tato simulace nemá uložené prompt logy. Logy jsou k dispozici pouze pro simulace spuštěné po aktivaci logování.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Filtr (person_id nebo question_id)…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="max-w-xs text-xs"
        />
        <span className="text-xs text-muted-foreground">
          Celkem {total} záznamů · strana {page + 1}/{totalPages}
        </span>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Načítám logy…</p>}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-6 px-2 py-2"></th>
                <th className="text-left px-3 py-2 font-medium">Person</th>
                <th className="text-left px-3 py-2 font-medium">Otázka</th>
                <th className="text-right px-3 py-2 font-medium">Run</th>
                <th className="text-left px-3 py-2 font-medium">Zdroj</th>
                <th className="text-left px-3 py-2 font-medium">Model</th>
                <th className="text-right px-3 py-2 font-medium">Latence</th>
                <th className="text-right px-3 py-2 font-medium">Tokeny</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, idx) => (
                <React.Fragment key={`${log.person_id}-${log.question_id}-${log.run}-${idx}`}>
                  <tr
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {expandedIdx === idx
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronRight className="h-3 w-3" />}
                    </td>
                    <td className="px-3 py-2 font-mono">{log.person_id.substring(0, 8)}…</td>
                    <td className="px-3 py-2 font-mono">{log.question_id.substring(0, 8)}…</td>
                    <td className="px-3 py-2 text-right">{log.run}</td>
                    <td className="px-3 py-2">
                      <Badge variant={log.source === 'openai' ? 'default' : 'secondary'}>
                        {log.source}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{log.model}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {log.latency_ms != null ? `${log.latency_ms} ms` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {log.tokens_used?.total ?? '—'}
                    </td>
                  </tr>
                  {expandedIdx === idx && (
                    <tr>
                      <td colSpan={8} className="px-4 py-3 bg-muted/20 border-b">
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">System prompt</p>
                            <pre className="text-xs whitespace-pre-wrap bg-background p-2 rounded border max-h-40 overflow-y-auto">
                              {log.system_prompt ?? '(stochastic bypass — žádný prompt)'}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">User prompt</p>
                            <pre className="text-xs whitespace-pre-wrap bg-background p-2 rounded border max-h-60 overflow-y-auto">
                              {log.user_prompt ?? '(stochastic bypass — žádný prompt)'}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Raw AI response</p>
                            <pre className="text-xs whitespace-pre-wrap bg-background p-2 rounded border max-h-40 overflow-y-auto">
                              {log.raw_response ?? '(stochastic bypass — žádná odpověď)'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          <Button size="sm" variant="outline" disabled={page === 0}
                  onClick={() => void loadPage(page - 1)}>
            Předchozí
          </Button>
          <span className="text-xs tabular-nums">{page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1}
                  onClick={() => void loadPage(page + 1)}>
            Další
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function VysledkyPage() {
  const [simulations, setSimulations] = useState<SimulationListItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null)
  const [crossTabs, setCrossTabs] = useState<CrossTab[] | null>(null)
  const [groupBy, setGroupBy] = useState('Pohlavi')
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [loadingCross, setLoadingCross] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Load completed simulations
  useEffect(() => {
    getSimulations().then((data) => {
      const list = Array.isArray(data)
        ? data
        : (data as unknown as { simulations: SimulationListItem[] }).simulations ?? []
      const completed = list.filter((s) => s.status === SimulationStatus.COMPLETED)
      setSimulations(completed)
      if (completed.length > 0 && !selectedId) {
        setSelectedId(completed[0]!.id)
      }
    }).catch(() => { /* non-critical */ })
  }, [selectedId])

  const loadAnalytics = useCallback(async (id: string) => {
    setLoadingAnalytics(true); setAnalyticsError(null); setAnalytics(null)
    try {
      const result = await getAnalyticsSummary(id)
      setAnalytics(result)
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'Chyba při načítání analytiky.')
    } finally { setLoadingAnalytics(false) }
  }, [])

  const loadCrossTabs = useCallback(async (id: string, by: string) => {
    setLoadingCross(true); setCrossTabs(null)
    try {
      const result = await getCrossTabs(id, by)
      setCrossTabs(result.cross_tabs)
    } catch { setCrossTabs([]) }
    finally { setLoadingCross(false) }
  }, [])

  useEffect(() => {
    if (selectedId) {
      void loadAnalytics(selectedId)
      void loadCrossTabs(selectedId, groupBy)
    }
  }, [selectedId, loadAnalytics, loadCrossTabs, groupBy])

  async function handleExport() {
    if (!selectedId) return
    setExporting(true)
    try { await exportAnalyticsXlsx(selectedId) } catch { /* non-critical */ }
    finally { setExporting(false) }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Výsledky</h2>
        </div>
        {selectedId && (
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4 mr-1.5" />
            {exporting ? 'Generuji…' : 'Export XLSX'}
          </Button>
        )}
      </div>

      {/* Simulation selector */}
      <div className="mb-6 max-w-sm">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Vyberte dokončenou simulaci…" />
          </SelectTrigger>
          <SelectContent>
            {simulations.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.id.substring(0, 8)}… · {s.config.strategy} · {s.config.model}
                {s.completed_at && ` · ${new Date(s.completed_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {simulations.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Žádné dokončené simulace. Nejdříve spusťte simulaci.
          </p>
        )}
      </div>

      {!selectedId && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground text-sm">Vyberte simulaci pro zobrazení výsledků.</p>
          </CardContent>
        </Card>
      )}

      {selectedId && (
        <Tabs defaultValue="prehled">
          <TabsList className="mb-4">
            <TabsTrigger value="prehled">Přehled</TabsTrigger>
            <TabsTrigger value="crosstabs">Cross-tabs</TabsTrigger>
            <TabsTrigger value="rawdata">Raw data</TabsTrigger>
            <TabsTrigger value="logy">Logy</TabsTrigger>
          </TabsList>

          {/* Přehled tab */}
          <TabsContent value="prehled">
            {loadingAnalytics && <p className="text-sm text-muted-foreground">Načítám analytiku…</p>}
            {analyticsError && <p className="text-sm text-destructive">{analyticsError}</p>}
            {analytics && (
              <div className="space-y-4">
                <div className="flex gap-3 flex-wrap">
                  <Badge variant="secondary">
                    Simulace {analytics.simulation_id.substring(0, 8)}…
                  </Badge>
                  <Badge variant="outline">
                    Vypočteno {new Date(analytics.computed_at).toLocaleString('cs-CZ')}
                  </Badge>
                </div>
                {analytics.frequency_tables.map((table) => (
                  <FrequencyChartCard key={table.question_id} table={table} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Cross-tabs tab */}
          <TabsContent value="crosstabs">
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm font-medium">Rozdělit dle:</span>
              <div className="w-48">
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_BY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {loadingCross && <p className="text-sm text-muted-foreground">Načítám cross-tabs…</p>}
            {crossTabs && crossTabs.length === 0 && (
              <p className="text-sm text-muted-foreground">Žádná data pro toto dělení.</p>
            )}
            {crossTabs && crossTabs.length > 0 && (
              <div className="space-y-4">
                {crossTabs.map((tab) => (
                  <CrossTabCard key={tab.question_id} tab={tab} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Raw data tab */}
          <TabsContent value="rawdata">
            {analytics ? (
              <RawDataTab analytics={analytics} />
            ) : loadingAnalytics ? (
              <p className="text-sm text-muted-foreground">Načítám…</p>
            ) : null}
          </TabsContent>

          {/* Logy tab */}
          <TabsContent value="logy">
            <LogyTab simulationId={selectedId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
