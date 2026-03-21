/**
 * Generate sample XLSX templates for Respondex
 * Run: node scripts/generate-templates.cjs
 */
'use strict'

const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')
const XLSX = require('C:/PRIVATE/TMP/respondex-dev/packages/shared/node_modules/xlsx')

const ROOT = join(__dirname, '..')
const TEMPLATES_DIR = join(ROOT, 'templates')
mkdirSync(TEMPLATES_DIR, { recursive: true })

// ── Population template ──────────────────────────────────────────────────────
function generatePopulationTemplate() {
  const persons = [
    { ID: 'P001', Vek: 34, Pohlavi: 'Muž', Vzdelani: 'Vysokoškolské', RodinnyStav: 'Ženatý/Vdaná', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Střední', Kraj: 'Praha', ZivotniPribeh: 'Vystudoval ekonomii na VŠE, pracuje jako finanční analytik v nadnárodní firmě. Žije v Praze s manželkou a dvěma dětmi. Politicky se považuje za středopravicového.' },
    { ID: 'P002', Vek: 67, Pohlavi: 'Žena', Vzdelani: 'S maturitou', RodinnyStav: 'Ovdovělý/á', MaPartnera: 'Ne', ZaměstnaneckyStatus: 'Důchodce/kyně', PrijmoveRozpeti: 'Nízký', Kraj: 'Moravskoslezský', ZivotniPribeh: 'Celý život pracovala jako zdravotní sestra v ostravské nemocnici. Ovdověla před třemi lety, bydlí sama v panelákovém bytě. Ráda zahradničí a sleduje seriály.' },
    { ID: 'P003', Vek: 22, Pohlavi: 'Žena', Vzdelani: 'S maturitou', RodinnyStav: 'Svobodný/á', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Student/ka', PrijmoveRozpeti: 'Nízký', Kraj: 'Jihomoravský', ZivotniPribeh: '' },
    { ID: 'P004', Vek: 45, Pohlavi: 'Muž', Vzdelani: 'Vyučení', RodinnyStav: 'Rozvedený/á', MaPartnera: 'Ne', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Spíše nižší', Kraj: 'Ústecký', ZivotniPribeh: '' },
    { ID: 'P005', Vek: 38, Pohlavi: 'Žena', Vzdelani: 'Vysokoškolské', RodinnyStav: 'Ženatý/Vdaná', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Mateřská/rodičovská dovolená', PrijmoveRozpeti: 'Spíše vyšší', Kraj: 'Středočeský', ZivotniPribeh: '' },
    { ID: 'P006', Vek: 52, Pohlavi: 'Muž', Vzdelani: 'Vysokoškolské', RodinnyStav: 'Ženatý/Vdaná', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Podnikatel/ka (OSVČ)', PrijmoveRozpeti: 'Vysoký', Kraj: 'Praha', ZivotniPribeh: '' },
    { ID: 'P007', Vek: 29, Pohlavi: 'Muž', Vzdelani: 'Vysokoškolské', RodinnyStav: 'Svobodný/á', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Střední', Kraj: 'Jihočeský', ZivotniPribeh: '' },
    { ID: 'P008', Vek: 71, Pohlavi: 'Muž', Vzdelani: 'Základní', RodinnyStav: 'Ženatý/Vdaná', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Důchodce/kyně', PrijmoveRozpeti: 'Nízký', Kraj: 'Kraj Vysočina', ZivotniPribeh: '' },
    { ID: 'P009', Vek: 33, Pohlavi: 'Žena', Vzdelani: 'Vyšší odborné', RodinnyStav: 'Svobodný/á', MaPartnera: 'Ne', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Střední', Kraj: 'Plzeňský', ZivotniPribeh: '' },
    { ID: 'P010', Vek: 41, Pohlavi: 'Žena', Vzdelani: 'S maturitou', RodinnyStav: 'Ženatý/Vdaná', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Střední', Kraj: 'Olomoucký', ZivotniPribeh: '' },
    { ID: 'P011', Vek: 25, Pohlavi: 'Muž', Vzdelani: 'S maturitou', RodinnyStav: 'Svobodný/á', MaPartnera: 'Ne', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Spíše nižší', Kraj: 'Liberecký', ZivotniPribeh: '' },
    { ID: 'P012', Vek: 58, Pohlavi: 'Žena', Vzdelani: 'Vyučení', RodinnyStav: 'Ženatý/Vdaná', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Spíše nižší', Kraj: 'Zlínský', ZivotniPribeh: '' },
    { ID: 'P013', Vek: 47, Pohlavi: 'Muž', Vzdelani: 'Vysokoškolské', RodinnyStav: 'Rozvedený/á', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Podnikatel/ka (OSVČ)', PrijmoveRozpeti: 'Spíše vyšší', Kraj: 'Královéhradecký', ZivotniPribeh: '' },
    { ID: 'P014', Vek: 19, Pohlavi: 'Žena', Vzdelani: 'S maturitou', RodinnyStav: 'Svobodný/á', MaPartnera: 'Ne', ZaměstnaneckyStatus: 'Student/ka', PrijmoveRozpeti: 'Nízký', Kraj: 'Pardubický', ZivotniPribeh: '' },
    { ID: 'P015', Vek: 63, Pohlavi: 'Muž', Vzdelani: 'Vyučení', RodinnyStav: 'Ženatý/Vdaná', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Důchodce/kyně', PrijmoveRozpeti: 'Střední', Kraj: 'Karlovarský', ZivotniPribeh: '' },
    { ID: 'P016', Vek: 36, Pohlavi: 'Žena', Vzdelani: 'Vysokoškolské', RodinnyStav: 'Svobodný/á', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Spíše vyšší', Kraj: 'Praha', ZivotniPribeh: '' },
    { ID: 'P017', Vek: 55, Pohlavi: 'Muž', Vzdelani: 'S maturitou', RodinnyStav: 'Ženatý/Vdaná', MaPartnera: 'Ano', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Střední', Kraj: 'Jihomoravský', ZivotniPribeh: '' },
    { ID: 'P018', Vek: 28, Pohlavi: 'Muž', Vzdelani: 'Vysokoškolské', RodinnyStav: 'Svobodný/á', MaPartnera: 'Ne', ZaměstnaneckyStatus: 'Zaměstnaný/á', PrijmoveRozpeti: 'Střední', Kraj: 'Středočeský', ZivotniPribeh: '' },
    { ID: 'P019', Vek: 44, Pohlavi: 'Žena', Vzdelani: 'Vyučení', RodinnyStav: 'Rozvedený/á', MaPartnera: 'Ne', ZaměstnaneckyStatus: 'Nezaměstnaný/á', PrijmoveRozpeti: 'Nízký', Kraj: 'Ústecký', ZivotniPribeh: 'Po rozvodu zůstala sama se dvěma dětmi. Přišla o práci v továrně před rokem. Aktivně hledá práci, ale na trhu v regionu není mnoho příležitostí.' },
    { ID: 'P020', Vek: 78, Pohlavi: 'Žena', Vzdelani: 'Základní', RodinnyStav: 'Ovdovělý/á', MaPartnera: 'Ne', ZaměstnaneckyStatus: 'Důchodce/kyně', PrijmoveRozpeti: 'Nízký', Kraj: 'Moravskoslezský', ZivotniPribeh: '' },
  ]

  const metadata = [
    { Pole: 'Název', Hodnota: 'Vzorová populace Respondex' },
    { Pole: 'Popis', Hodnota: 'Ukázková populace 20 osob pokrývající různé demografické skupiny české populace' },
    { Pole: 'Zdroj', Hodnota: 'Ručně sestaveno pro demonstraci platformy Respondex' },
    { Pole: 'Datum', Hodnota: new Date().toISOString().split('T')[0] },
    { Pole: 'Verze', Hodnota: '1.0' },
  ]

  const wb = XLSX.utils.book_new()
  const wsOsoby = XLSX.utils.json_to_sheet(persons)
  const wsMeta = XLSX.utils.json_to_sheet(metadata)

  wsOsoby['!cols'] = [
    { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 18 }, { wch: 20 },
    { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 60 },
  ]

  XLSX.utils.book_append_sheet(wb, wsOsoby, 'Osoby')
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// ── Questionnaire template ───────────────────────────────────────────────────
function generateQuestionnaireTemplate() {
  const questions = [
    { ID: 'Q01', Poradi: 1, Text: 'Jak jste celkově spokojeni se svým životem?', Typ: 'likert', Moznosti: '', SkalaMin: 1, SkalaMax: 5, SkalaMinPopisek: 'Zcela nespokojen/a', SkalaMaxPopisek: 'Velmi spokojen/a', Povinne: 'Ano', SkipLogic: '', PipingFrom: '' },
    { ID: 'Q02', Poradi: 2, Text: 'Hlasoval/a jste v posledních parlamentních volbách?', Typ: 'yes_no', Moznosti: '', SkalaMin: '', SkalaMax: '', SkalaMinPopisek: '', SkalaMaxPopisek: '', Povinne: 'Ano', SkipLogic: '', PipingFrom: '' },
    { ID: 'Q03', Poradi: 3, Text: 'Jaká je pro vás v současnosti nejdůležitější politická témata?', Typ: 'single_choice', Moznosti: 'Ekonomika a životní úroveň;Zdravotnictví;Bezpečnost a obrana;Životní prostředí;Migrace a integrace', SkalaMin: '', SkalaMax: '', SkalaMinPopisek: '', SkalaMaxPopisek: '', Povinne: 'Ano', SkipLogic: 'Q02=Ano', PipingFrom: '' },
    { ID: 'Q04', Poradi: 4, Text: 'Kolik hodin týdně přibližně sledujete zpravodajství?', Typ: 'number', Moznosti: '', SkalaMin: 0, SkalaMax: 80, SkalaMinPopisek: '', SkalaMaxPopisek: '', Povinne: 'Ano', SkipLogic: '', PipingFrom: '' },
    { ID: 'Q05', Poradi: 5, Text: 'Která z médií využíváte jako hlavní zdroj zpravodajství? (Vyberte vše)', Typ: 'multi_choice', Moznosti: 'Česká televize;Soukromé televizní stanice;Online zpravodajské servery;Sociální sítě;Tištěné noviny/časopisy;Rádio', SkalaMin: '', SkalaMax: '', SkalaMinPopisek: '', SkalaMaxPopisek: '', Povinne: 'Ne', SkipLogic: '', PipingFrom: '' },
    { ID: 'Q06', Poradi: 6, Text: 'Do jaké míry důvěřujete veřejným institucím v ČR?', Typ: 'likert', Moznosti: '', SkalaMin: 1, SkalaMax: 5, SkalaMinPopisek: 'Vůbec nedůvěřuji', SkalaMaxPopisek: 'Plně důvěřuji', Povinne: 'Ano', SkipLogic: '', PipingFrom: '' },
    { ID: 'Q07', Poradi: 7, Text: 'Jak hodnotíte ekonomickou situaci v České republice?', Typ: 'single_choice', Moznosti: 'Velmi dobrá;Spíše dobrá;Ani dobrá, ani špatná;Spíše špatná;Velmi špatná', SkalaMin: '', SkalaMax: '', SkalaMinPopisek: '', SkalaMaxPopisek: '', Povinne: 'Ano', SkipLogic: '', PipingFrom: '' },
    { ID: 'Q08', Poradi: 8, Text: 'Nakolik byste doporučil/a Českou republiku jako místo k životu (0-10)?', Typ: 'nps', Moznosti: '', SkalaMin: 0, SkalaMax: 10, SkalaMinPopisek: 'Vůbec bych nedoporučil/a', SkalaMaxPopisek: 'Rozhodně bych doporučil/a', Povinne: 'Ano', SkipLogic: '', PipingFrom: '' },
    { ID: 'Q09', Poradi: 9, Text: 'Popište vlastními slovy, co pro vás znamená kvalitní život.', Typ: 'open_text', Moznosti: '', SkalaMin: '', SkalaMax: '', SkalaMinPopisek: '', SkalaMaxPopisek: '', Povinne: 'Ne', SkipLogic: '', PipingFrom: '' },
    { ID: 'Q10', Poradi: 10, Text: 'Seřaďte hodnoty podle důležitosti (1 = nejdůležitější).', Typ: 'ranking', Moznosti: 'Rodina;Zdraví;Finanční zabezpečení;Kariéra;Volný čas a koníčky', SkalaMin: '', SkalaMax: '', SkalaMinPopisek: '', SkalaMaxPopisek: '', Povinne: 'Ano', SkipLogic: '', PipingFrom: '' },
  ]

  const metadata = [
    { Pole: 'Název', Hodnota: 'Vzorový dotazník Respondex' },
    { Pole: 'Popis', Hodnota: 'Ukázkový dotazník pokrývající různé typy otázek' },
    { Pole: 'Jazyk', Hodnota: 'cs' },
    { Pole: 'Verze', Hodnota: '1.0' },
    { Pole: 'Datum', Hodnota: new Date().toISOString().split('T')[0] },
  ]

  const wb = XLSX.utils.book_new()
  const wsOtazky = XLSX.utils.json_to_sheet(questions)
  const wsMeta = XLSX.utils.json_to_sheet(metadata)

  wsOtazky['!cols'] = [
    { wch: 6 }, { wch: 8 }, { wch: 60 }, { wch: 14 }, { wch: 60 },
    { wch: 9 }, { wch: 9 }, { wch: 20 }, { wch: 20 },
    { wch: 9 }, { wch: 16 }, { wch: 12 },
  ]

  XLSX.utils.book_append_sheet(wb, wsOtazky, 'Otazky')
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

const populationBuffer = generatePopulationTemplate()
writeFileSync(join(TEMPLATES_DIR, 'sample-population.xlsx'), populationBuffer)
console.log('✓ templates/sample-population.xlsx generated')

const questionnaireBuffer = generateQuestionnaireTemplate()
writeFileSync(join(TEMPLATES_DIR, 'sample-questionnaire.xlsx'), questionnaireBuffer)
console.log('✓ templates/sample-questionnaire.xlsx generated')
