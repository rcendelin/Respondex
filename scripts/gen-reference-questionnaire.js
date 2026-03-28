#!/usr/bin/env node
/**
 * Generate the reference questionnaire XLSX for A/B testing.
 * Questions come from the REFERENCE_QUESTIONS dataset (CVVM, ESS, PIAAC).
 *
 * Output: templates/reference-questionnaire.xlsx
 * Import this into Respondex as a questionnaire, then run simulations against it.
 */

const XLSX = require('xlsx')
const path = require('path')

const questions = [
  // ── CVVM: Trust in institutions (yes/no) ───────────────────────
  { id: 'REF-CVVM-TRUST-GOV',    order: 1,  text: 'Důvěřujete vládě České republiky?',                                type: 'yes_no',        options: '', scaleMin: '', scaleMax: '', required: 'Ano' },
  { id: 'REF-CVVM-TRUST-PRES',   order: 2,  text: 'Důvěřujete prezidentovi republiky?',                               type: 'yes_no',        options: '', scaleMin: '', scaleMax: '', required: 'Ano' },
  { id: 'REF-CVVM-TRUST-PARL',   order: 3,  text: 'Důvěřujete Poslanecké sněmovně?',                                  type: 'yes_no',        options: '', scaleMin: '', scaleMax: '', required: 'Ano' },
  { id: 'REF-CVVM-TRUST-SENATE', order: 4,  text: 'Důvěřujete Senátu?',                                               type: 'yes_no',        options: '', scaleMin: '', scaleMax: '', required: 'Ano' },
  { id: 'REF-CVVM-TRUST-MAYOR',  order: 5,  text: 'Důvěřujete starostovi/starostce vaší obce?',                       type: 'yes_no',        options: '', scaleMin: '', scaleMax: '', required: 'Ano' },

  // ── CVVM: Political satisfaction (single choice) ───────────────
  { id: 'REF-CVVM-POLSAT', order: 6, text: 'Jak jste spokojen/a s politickou situací v České republice?', type: 'single_choice', options: 'Velmi spokojen/a;Spíše spokojen/a;Ani spokojen/a, ani nespokojen/a;Spíše nespokojen/a;Velmi nespokojen/a', scaleMin: '', scaleMax: '', required: 'Ano' },

  // ── ESS: Trust & satisfaction on 0-10 scale ────────────────────
  { id: 'REF-ESS-TRSTPRL', order: 7,  text: 'Na stupnici od 0 do 10, nakolik důvěřujete českému parlamentu? (0 = vůbec nedůvěřuji, 10 = zcela důvěřuji)',                  type: 'number', options: '', scaleMin: 0, scaleMax: 10, required: 'Ano' },
  { id: 'REF-ESS-TRSTPLC', order: 8,  text: 'Na stupnici od 0 do 10, nakolik důvěřujete policii? (0 = vůbec nedůvěřuji, 10 = zcela důvěřuji)',                              type: 'number', options: '', scaleMin: 0, scaleMax: 10, required: 'Ano' },
  { id: 'REF-ESS-STFLIFE', order: 9,  text: 'Jak jste celkově spokojen/a se svým životem? (0 = zcela nespokojen/a, 10 = zcela spokojen/a)',                                 type: 'number', options: '', scaleMin: 0, scaleMax: 10, required: 'Ano' },
  { id: 'REF-ESS-STFECO',  order: 10, text: 'Jak jste spokojen/a s nynějším stavem ekonomiky v České republice? (0 = zcela nespokojen/a, 10 = zcela spokojen/a)',            type: 'number', options: '', scaleMin: 0, scaleMax: 10, required: 'Ano' },
  { id: 'REF-ESS-STFDEM',  order: 11, text: 'A jak jste celkově spokojen/a s tím, jak demokracie v České republice funguje? (0 = zcela nespokojen/a, 10 = zcela spokojen/a)', type: 'number', options: '', scaleMin: 0, scaleMax: 10, required: 'Ano' },

  // ── Numeracy competence ────────────────────────────────────────
  { id: 'REF-NUM-PERCENT',     order: 12, text: 'V obchodě je sleva 25 % na tričko, které stálo původně 800 Kč. Kolik zaplatíte po slevě?',                                      type: 'number', options: '', scaleMin: 0, scaleMax: 10000, required: 'Ano' },
  { id: 'REF-NUM-PROBABILITY', order: 13, text: 'V sáčku je 10 kuliček — 3 červené a 7 modrých. Jaká je pravděpodobnost (v procentech), že náhodně vytáhnete červenou kuličku?', type: 'number', options: '', scaleMin: 0, scaleMax: 100,   required: 'Ano' },

  // ── Health & economic (single choice) ──────────────────────────
  { id: 'REF-CULTURE-HEALTH', order: 14, text: 'Jak byste ohodnotil/a svůj zdravotní stav?',  type: 'single_choice', options: 'Velmi dobrý;Dobrý;Uspokojivý;Špatný;Velmi špatný', scaleMin: '', scaleMax: '', required: 'Ano' },
  { id: 'REF-CULTURE-INCOME', order: 15, text: 'Jak vycházíte s příjmem vaší domácnosti?',    type: 'single_choice', options: 'Žijeme pohodlně;Vycházíme;Je to obtížné;Je to velmi obtížné', scaleMin: '', scaleMax: '', required: 'Ano' },
]

// Build worksheet data
const header = ['ID', 'Poradi', 'Text', 'Typ', 'Moznosti', 'SkalaMin', 'SkalaMax', 'Povinne']
const rows = questions.map(q => [
  q.id, q.order, q.text, q.type, q.options, q.scaleMin, q.scaleMax, q.required
])

const ws = XLSX.utils.aoa_to_sheet([header, ...rows])

// Set column widths
ws['!cols'] = [
  { wch: 24 }, // ID
  { wch: 6 },  // Poradi
  { wch: 80 }, // Text
  { wch: 14 }, // Typ
  { wch: 60 }, // Moznosti
  { wch: 8 },  // SkalaMin
  { wch: 8 },  // SkalaMax
  { wch: 6 },  // Povinne
]

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Otazky')

const outPath = path.resolve(__dirname, '..', 'templates', 'reference-questionnaire.xlsx')
XLSX.writeFile(wb, outPath)
console.log(`✅ Reference questionnaire generated: ${outPath}`)
console.log(`   ${questions.length} questions (${questions.filter(q => q.type === 'yes_no').length} yes/no, ${questions.filter(q => q.type === 'number').length} number, ${questions.filter(q => q.type === 'single_choice').length} single_choice)`)
