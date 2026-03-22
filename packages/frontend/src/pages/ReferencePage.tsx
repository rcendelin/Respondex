import { useState, useEffect, useMemo } from 'react'
import { BookOpen, ExternalLink, Info, AlertTriangle } from 'lucide-react'
import type {
  NumeracyReferenceDataset,
  NumeracyDistributionRow,
  NumeracyConfirmedDataPoint,
  NumeracyLevelDefinition,
  NumeracyMarginalDistribution,
  AgeGroup,
  NumeracyGender,
  NumeracyEducation,
} from '@respondex/shared'
import { NumeracyLevel } from '@respondex/shared'
import { NUMERACY_REFERENCE_DATA } from '@respondex/shared'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts'

// ── Constants ──────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  [NumeracyLevel.BELOW_1]: '#dc2626',
  [NumeracyLevel.LEVEL_1]: '#ea580c',
  [NumeracyLevel.LEVEL_2]: '#d97706',
  [NumeracyLevel.LEVEL_3]: '#059669',
  [NumeracyLevel.LEVEL_4]: '#2563eb',
  [NumeracyLevel.LEVEL_5]: '#7c3aed',
}

const LEVEL_SHORT: Record<string, string> = {
  [NumeracyLevel.BELOW_1]: '<1',
  [NumeracyLevel.LEVEL_1]: '1',
  [NumeracyLevel.LEVEL_2]: '2',
  [NumeracyLevel.LEVEL_3]: '3',
  [NumeracyLevel.LEVEL_4]: '4',
  [NumeracyLevel.LEVEL_5]: '5',
}

const AGE_GROUPS: AgeGroup[] = ['16-24', '25-34', '35-44', '45-54', '55-65']
const GENDERS: NumeracyGender[] = ['Muž', 'Žena']
const EDUCATIONS: { value: NumeracyEducation; label: string }[] = [
  { value: 'below_secondary', label: 'Bez maturity' },
  { value: 'upper_secondary', label: 'S maturitou' },
  { value: 'tertiary', label: 'Vysokoškolské' },
]

const ALL_LEVELS = [
  NumeracyLevel.BELOW_1, NumeracyLevel.LEVEL_1, NumeracyLevel.LEVEL_2,
  NumeracyLevel.LEVEL_3, NumeracyLevel.LEVEL_4, NumeracyLevel.LEVEL_5,
]

// ── Subcomponents ──────────────────────────────────────────────────────────

function MarginalChart({ dist }: { dist: NumeracyMarginalDistribution }) {
  const data = ALL_LEVELS.map((level) => ({
    name: LEVEL_SHORT[level],
    fullName: level,
    pct: Math.round(dist.distribution[level] * 1000) / 10,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {dist.scope}
          <Badge variant="secondary" className="text-xs">{dist.country}</Badge>
          <Badge variant="outline" className="text-xs">Ø {dist.mean_score} b.</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ left: 0, right: 20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 40]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val: number) => [`${val} %`, 'Podíl']}
              labelFormatter={(label: string) => `Úroveň ${label}`}
            />
            <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={LEVEL_COLORS[entry.fullName]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function LevelDefinitionsTable({ defs }: { defs: NumeracyLevelDefinition[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Definice úrovní PIAAC (škála 0–500)</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-medium">Úroveň</th>
              <th className="py-2 pr-3 font-medium">Skóre</th>
              <th className="py-2 font-medium">Popis schopností</th>
            </tr>
          </thead>
          <tbody>
            {defs.map((d) => (
              <tr key={d.key} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <Badge
                    style={{ backgroundColor: LEVEL_COLORS[d.level], color: '#fff' }}
                    className="text-xs"
                  >
                    {LEVEL_SHORT[d.level]}
                  </Badge>
                </td>
                <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                  {d.score_min}–{d.score_max === 500 ? '500' : d.score_max}
                </td>
                <td className="py-2 text-xs">{d.description_cz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function ConfirmedDataTable({ data }: { data: NumeracyConfirmedDataPoint[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Info className="h-4 w-4" />
          Potvrzená data z PIAAC
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Přímo citováno z oficiálních OECD / MŠMT / NPI zdrojů
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-medium">Ukazatel</th>
              <th className="py-2 pr-3 font-medium text-right">Hodnota</th>
              <th className="py-2 pr-3 font-medium">Zdroj</th>
              <th className="py-2 font-medium">Poznámka</th>
            </tr>
          </thead>
          <tbody>
            {data.map((dp, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1.5 pr-3 text-xs">{dp.label}</td>
                <td className="py-1.5 pr-3 text-xs text-right font-mono font-medium">
                  {dp.value}{dp.unit ? ` ${dp.unit}` : ''}
                </td>
                <td className="py-1.5 pr-3">
                  <Badge variant="outline" className="text-xs">{dp.source_id}</Badge>
                </td>
                <td className="py-1.5 text-xs text-muted-foreground">{dp.notes ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function ConditionalHeatmap({
  rows,
  gender,
  education,
}: {
  rows: NumeracyDistributionRow[]
  gender: NumeracyGender
  education: NumeracyEducation
}) {
  const filtered = rows.filter((r) => r.gender === gender && r.education === education)
  if (filtered.length === 0) return null

  const chartData = filtered.map((r) => ({
    age: r.age_group,
    mean: r.estimated_mean,
    ...Object.fromEntries(
      ALL_LEVELS.map((level) => [LEVEL_SHORT[level], Math.round(r.distribution[level] * 1000) / 10])
    ),
  }))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Badge variant="outline">{gender}</Badge>
        <Badge variant="outline">{EDUCATIONS.find((e) => e.value === education)?.label}</Badge>
      </div>

      {/* Distribution stacked bars */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ left: 0, right: 30 }}>
          <XAxis dataKey="age" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(val: number, name: string) => [`${val} %`, `Úroveň ${name}`]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {ALL_LEVELS.map((level) => (
            <Bar
              key={level}
              dataKey={LEVEL_SHORT[level] ?? level}
              stackId="a"
              fill={LEVEL_COLORS[level] ?? '#888'}
              name={LEVEL_SHORT[level] ?? level}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Data table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2 font-medium">Věk</th>
              <th className="py-1 pr-2 font-medium text-right">Ø skóre</th>
              {ALL_LEVELS.map((level) => (
                <th key={level} className="py-1 pr-1 font-medium text-right">
                  <span style={{ color: LEVEL_COLORS[level] }}>{LEVEL_SHORT[level]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.age_group} className="border-b last:border-0">
                <td className="py-1 pr-2">{r.age_group}</td>
                <td className="py-1 pr-2 text-right font-mono">{r.estimated_mean}</td>
                {ALL_LEVELS.map((level) => (
                  <td key={level} className="py-1 pr-1 text-right font-mono">
                    {Math.round(r.distribution[level] * 100)}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SourcesList({ sources }: { sources: NumeracyReferenceDataset['sources'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Zdroje dat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sources.map((s) => (
          <div key={s.id} className="flex items-start gap-2 text-xs">
            <Badge
              variant={s.confidence === 'confirmed' ? 'default' : 'secondary'}
              className="text-xs shrink-0 mt-0.5"
            >
              {s.id}
            </Badge>
            <div>
              <p className="font-medium">{s.name} ({s.organization}, {s.year})</p>
              <p className="text-muted-foreground">{s.description_cz}</p>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                >
                  Otevřít zdroj <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function ReferencePage() {
  const data = NUMERACY_REFERENCE_DATA

  const [selectedGender, setSelectedGender] = useState<NumeracyGender>('Muž')
  const [selectedEducation, setSelectedEducation] = useState<NumeracyEducation>('upper_secondary')

  // Mean score comparison chart across all education×gender combos
  const meanComparisonData = useMemo(() => {
    return AGE_GROUPS.map((age) => {
      const row: Record<string, string | number> = { age }
      for (const edu of EDUCATIONS) {
        for (const g of GENDERS) {
          const match = data.conditional_distributions.find(
            (r) => r.age_group === age && r.gender === g && r.education === edu.value
          )
          if (match) {
            row[`${g === 'Muž' ? 'M' : 'Ž'}_${edu.value}`] = match.estimated_mean
          }
        }
      }
      return row
    })
  }, [data])

  const meanSeriesKeys = useMemo(() => {
    const keys: { key: string; label: string; color: string }[] = []
    const colors = ['#2563eb', '#93c5fd', '#059669', '#6ee7b7', '#d97706', '#fcd34d']
    let ci = 0
    for (const edu of EDUCATIONS) {
      for (const g of GENDERS) {
        keys.push({
          key: `${g === 'Muž' ? 'M' : 'Ž'}_${edu.value}`,
          label: `${g === 'Muž' ? '♂' : '♀'} ${edu.label}`,
          color: colors[ci % colors.length] ?? '#888',
        })
        ci++
      }
    }
    return keys
  }, [])

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold tracking-tight">Referenční data</h2>
          <p className="text-sm text-muted-foreground">
            Numerické schopnosti české populace (PIAAC 2023)
          </p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs">
          v{data.version} • aktualizace {data.last_updated}
        </Badge>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Odvozená data</p>
          <p>
            Podmíněné distribuce (záložka „Podmíněné distribuce") jsou odvozeny z potvrzených
            marginálních distribucí pomocí logistické interpolace. Nejsou to přímá měření —
            pro přesná data z konkrétních demografických buněk je nutné přistoupit
            k OECD PIAAC Data Explorer. Potvrzená data (záložka „Potvrzená data") pocházejí
            přímo z oficiálních zdrojů.
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Přehled</TabsTrigger>
          <TabsTrigger value="confirmed">Potvrzená data</TabsTrigger>
          <TabsTrigger value="conditional">Podmíněné distribuce</TabsTrigger>
          <TabsTrigger value="comparison">Srovnání skupin</TabsTrigger>
          <TabsTrigger value="sources">Zdroje</TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.marginal_distributions.map((dist, i) => (
              <MarginalChart key={i} dist={dist} />
            ))}
          </div>
          <LevelDefinitionsTable defs={data.level_definitions} />
        </TabsContent>

        {/* ── Confirmed data ──────────────────────────── */}
        <TabsContent value="confirmed" className="mt-4">
          <ConfirmedDataTable data={data.confirmed_data} />
        </TabsContent>

        {/* ── Conditional distributions ────────────────── */}
        <TabsContent value="conditional" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Distribuce úrovní numeracy podle demografických skupin
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                P(úroveň | věk, pohlaví, vzdělání) — vyberte kombinaci pro zobrazení
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Select
                  value={selectedGender}
                  onValueChange={(v) => setSelectedGender(v as NumeracyGender)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedEducation}
                  onValueChange={(v) => setSelectedEducation(v as NumeracyEducation)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATIONS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ConditionalHeatmap
                rows={data.conditional_distributions}
                gender={selectedGender}
                education={selectedEducation}
              />
            </CardContent>
          </Card>

          {/* All combinations overview table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Kompletní tabulka: odhadované průměrné skóre
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Řádky = věk × pohlaví, sloupce = vzdělání. Hodnoty = odhadovaný průměr PIAAC skóre.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1.5 pr-2 font-medium">Věk</th>
                    <th className="py-1.5 pr-2 font-medium">Pohlaví</th>
                    {EDUCATIONS.map((e) => (
                      <th key={e.value} className="py-1.5 pr-2 font-medium text-center">
                        {e.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AGE_GROUPS.map((age) =>
                    GENDERS.map((gender) => {
                      const cells = EDUCATIONS.map((edu) => {
                        const row = data.conditional_distributions.find(
                          (r) => r.age_group === age && r.gender === gender && r.education === edu.value
                        )
                        return row?.estimated_mean ?? '–'
                      })
                      return (
                        <tr key={`${age}-${gender}`} className="border-b last:border-0">
                          <td className="py-1 pr-2">{gender === 'Muž' ? age : ''}</td>
                          <td className="py-1 pr-2">{gender}</td>
                          {cells.map((val, i) => (
                            <td key={i} className="py-1 pr-2 text-center font-mono">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-xs"
                                style={{
                                  backgroundColor:
                                    typeof val === 'number'
                                      ? val >= 290 ? '#dcfce7'
                                        : val >= 270 ? '#f0fdf4'
                                        : val >= 250 ? '#fefce8'
                                        : val >= 230 ? '#fff7ed'
                                        : '#fef2f2'
                                      : undefined,
                                }}
                              >
                                {val}
                              </span>
                            </td>
                          ))}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Comparison chart ─────────────────────────── */}
        <TabsContent value="comparison" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Průměrné numeracy skóre podle věku, pohlaví a vzdělání
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Srovnání odhadovaných průměrů přes všechny demografické kombinace
              </p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={meanComparisonData} margin={{ left: 0, right: 20 }}>
                  <XAxis dataKey="age" tick={{ fontSize: 12 }} />
                  <YAxis domain={[200, 320]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {meanSeriesKeys.map((s) => (
                    <Bar key={s.key} dataKey={s.key} fill={s.color} name={s.label} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gender gap visualization */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Genderový rozdíl (♂ − ♀) podle vzdělání a věku</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1.5 pr-2 font-medium">Věk</th>
                    {EDUCATIONS.map((e) => (
                      <th key={e.value} className="py-1.5 pr-2 font-medium text-center">{e.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AGE_GROUPS.map((age) => {
                    const cells = EDUCATIONS.map((edu) => {
                      const male = data.conditional_distributions.find(
                        (r) => r.age_group === age && r.gender === 'Muž' && r.education === edu.value
                      )
                      const female = data.conditional_distributions.find(
                        (r) => r.age_group === age && r.gender === 'Žena' && r.education === edu.value
                      )
                      if (!male || !female) return '–'
                      return male.estimated_mean - female.estimated_mean
                    })
                    return (
                      <tr key={age} className="border-b last:border-0">
                        <td className="py-1 pr-2">{age}</td>
                        {cells.map((val, i) => (
                          <td key={i} className="py-1 pr-2 text-center font-mono">
                            {typeof val === 'number' ? `+${val}` : val}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                Potvrzený celkový genderový rozdíl: <strong>11 bodů</strong> ve prospěch mužů (OECD průměr: 10).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sources ──────────────────────────────────── */}
        <TabsContent value="sources" className="mt-4">
          <SourcesList sources={data.sources} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
