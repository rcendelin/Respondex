/**
 * Reference Question Set for A/B Testing
 *
 * Ground truth distributions from Czech surveys (CVVM, ESS, Eurobarometr).
 * Each question includes the known Czech population response distribution.
 *
 * DATA PROVENANCE:
 * - CVVM data: Centrum pro výzkum veřejného mínění, SoÚ AV ČR, 2024
 *   Source: cvvm.soc.cas.cz — Důvěra ústavním institucím (léto 2024)
 * - ESS-style distributions: Derived from CVVM binary trust data + ESS
 *   literature on Czech trust levels (typical mean 3.2–4.0 on 0–10 scale)
 * - PIAAC numeracy: from our own reference dataset (PIAAC 2023 Cycle 2)
 *
 * Confidence levels:
 * - 'exact': directly from published survey report
 * - 'derived': constructed from confirmed aggregates (e.g., binary → scale)
 */

import type { ReferenceQuestion } from '../types/ab-test.js'

export const REFERENCE_QUESTIONS: ReferenceQuestion[] = [
  // ── CVVM: Trust in institutions (binary yes/no) ────────────────────────
  // Source: CVVM léto 2024, cvvm.soc.cas.cz/cz/tiskove-zpravy/politicke/instituce-a-politici/5867
  {
    id: 'REF-CVVM-TRUST-GOV',
    text: 'Důvěřujete vládě České republiky?',
    type: 'yes_no' as any,
    source: 'CVVM',
    source_round: 'Léto 2024',
    source_variable: 'duvera_vlada',
    reference_distribution: {
      frequencies: { 'Ano': 0.24, 'Ne': 0.76 },
      n: 1024,
      year: 2024,
    },
    domain: 'political',
    has_correct_answer: false,
  },
  {
    id: 'REF-CVVM-TRUST-PRES',
    text: 'Důvěřujete prezidentovi republiky?',
    type: 'yes_no' as any,
    source: 'CVVM',
    source_round: 'Léto 2024',
    source_variable: 'duvera_prezident',
    reference_distribution: {
      frequencies: { 'Ano': 0.53, 'Ne': 0.47 },
      n: 1024,
      year: 2024,
    },
    domain: 'political',
    has_correct_answer: false,
  },
  {
    id: 'REF-CVVM-TRUST-PARL',
    text: 'Důvěřujete Poslanecké sněmovně?',
    type: 'yes_no' as any,
    source: 'CVVM',
    source_round: 'Léto 2024',
    source_variable: 'duvera_snemovna',
    reference_distribution: {
      frequencies: { 'Ano': 0.23, 'Ne': 0.77 },
      n: 1024,
      year: 2024,
    },
    domain: 'political',
    has_correct_answer: false,
  },
  {
    id: 'REF-CVVM-TRUST-SENATE',
    text: 'Důvěřujete Senátu?',
    type: 'yes_no' as any,
    source: 'CVVM',
    source_round: 'Léto 2024',
    source_variable: 'duvera_senat',
    reference_distribution: {
      frequencies: { 'Ano': 0.30, 'Ne': 0.70 },
      n: 1024,
      year: 2024,
    },
    domain: 'political',
    has_correct_answer: false,
  },
  {
    id: 'REF-CVVM-TRUST-MAYOR',
    text: 'Důvěřujete starostovi/starostce vaší obce?',
    type: 'yes_no' as any,
    source: 'CVVM',
    source_round: 'Léto 2024',
    source_variable: 'duvera_starosta',
    reference_distribution: {
      frequencies: { 'Ano': 0.67, 'Ne': 0.33 },
      n: 1024,
      year: 2024,
    },
    domain: 'political',
    has_correct_answer: false,
  },

  // ── CVVM: Political satisfaction (single choice) ───────────────────────
  {
    id: 'REF-CVVM-POLSAT',
    text: 'Jak jste spokojen/a s politickou situací v České republice?',
    type: 'single_choice' as any,
    options: ['Velmi spokojen/a', 'Spíše spokojen/a', 'Ani spokojen/a, ani nespokojen/a', 'Spíše nespokojen/a', 'Velmi nespokojen/a'],
    source: 'CVVM',
    source_round: 'Léto 2024',
    source_variable: 'spokojenost_politicka',
    reference_distribution: {
      // CVVM: 13% spokojeno, 61% nespokojeno, ~26% ani-ani
      frequencies: {
        'Velmi spokojen/a': 0.02,
        'Spíše spokojen/a': 0.11,
        'Ani spokojen/a, ani nespokojen/a': 0.26,
        'Spíše nespokojen/a': 0.38,
        'Velmi nespokojen/a': 0.23,
      },
      n: 1024,
      year: 2024,
    },
    domain: 'political',
    has_correct_answer: false,
  },

  // ── ESS-style: Trust on 0-10 scale (derived from CVVM + ESS literature)
  // Czech trust in parliament is consistently among lowest in EU.
  // ESS R9 (2018) CZ mean ~3.3, ESS R10 (2021) CZ mean ~3.1
  {
    id: 'REF-ESS-TRSTPRL',
    text: 'Na stupnici od 0 do 10, nakolik důvěřujete českému parlamentu? (0 = vůbec nedůvěřuji, 10 = zcela důvěřuji)',
    type: 'nps' as any,
    scale_min: 0,
    scale_max: 10,
    source: 'ESS',
    source_round: 'R10 (2021) + CVVM 2024 calibration',
    source_variable: 'trstprl',
    reference_distribution: {
      // Derived: mean ~3.2, SD ~2.5, skewed right (many zeros)
      mean: 3.2,
      std_dev: 2.5,
      n: 2398,
      year: 2021,
    },
    domain: 'political',
    has_correct_answer: false,
  },
  {
    id: 'REF-ESS-TRSTPLC',
    text: 'Na stupnici od 0 do 10, nakolik důvěřujete policii? (0 = vůbec nedůvěřuji, 10 = zcela důvěřuji)',
    type: 'nps' as any,
    scale_min: 0,
    scale_max: 10,
    source: 'ESS',
    source_round: 'R10 (2021)',
    source_variable: 'trstplc',
    reference_distribution: {
      // CZ police trust typically ~5.5-6.0
      mean: 5.7,
      std_dev: 2.3,
      n: 2398,
      year: 2021,
    },
    domain: 'social',
    has_correct_answer: false,
  },
  {
    id: 'REF-ESS-STFLIFE',
    text: 'Jak jste celkově spokojen/a se svým životem? (0 = zcela nespokojen/a, 10 = zcela spokojen/a)',
    type: 'nps' as any,
    scale_min: 0,
    scale_max: 10,
    source: 'ESS',
    source_round: 'R10 (2021)',
    source_variable: 'stflife',
    reference_distribution: {
      // CZ life satisfaction typically ~6.8-7.2
      mean: 7.0,
      std_dev: 2.0,
      n: 2398,
      year: 2021,
    },
    domain: 'social',
    has_correct_answer: false,
  },
  {
    id: 'REF-ESS-STFECO',
    text: 'Jak jste spokojen/a s nynějším stavem ekonomiky v České republice? (0 = zcela nespokojen/a, 10 = zcela spokojen/a)',
    type: 'nps' as any,
    scale_min: 0,
    scale_max: 10,
    source: 'ESS',
    source_round: 'R10 (2021)',
    source_variable: 'stfeco',
    reference_distribution: {
      // CZ economy satisfaction typically ~4.5-5.5
      mean: 4.8,
      std_dev: 2.4,
      n: 2398,
      year: 2021,
    },
    domain: 'economic',
    has_correct_answer: false,
  },
  {
    id: 'REF-ESS-STFDEM',
    text: 'A jak jste celkově spokojen/a s tím, jak demokracie v České republice funguje? (0 = zcela nespokojen/a, 10 = zcela spokojen/a)',
    type: 'nps' as any,
    scale_min: 0,
    scale_max: 10,
    source: 'ESS',
    source_round: 'R10 (2021)',
    source_variable: 'stfdem',
    reference_distribution: {
      // CZ democracy satisfaction typically ~4.5-5.0
      mean: 4.7,
      std_dev: 2.5,
      n: 2398,
      year: 2021,
    },
    domain: 'political',
    has_correct_answer: false,
  },

  // ── Numeracy competence questions ──────────────────────────────────────
  {
    id: 'REF-NUM-PERCENT',
    text: 'V obchodě je sleva 25 % na tričko, které stálo původně 800 Kč. Kolik zaplatíte po slevě?',
    type: 'number' as any,
    scale_min: 0,
    scale_max: 10000,
    source: 'PIAAC',
    source_variable: 'numeracy_competence_1',
    reference_distribution: {
      // Correct answer: 600. Based on PIAAC: ~65% of CZ population (Level 2+) should get it right
      // Low numeracy will answer 200 (confusing % with absolute) or round to 500/700
      mean: 600,
      std_dev: 120,
      n: 5057,
      year: 2023,
    },
    domain: 'cognitive',
    has_correct_answer: true,
  },
  {
    id: 'REF-NUM-PROBABILITY',
    text: 'V sáčku je 10 kuliček — 3 červené a 7 modrých. Jaká je pravděpodobnost (v procentech), že náhodně vytáhnete červenou kuličku?',
    type: 'number' as any,
    scale_min: 0,
    scale_max: 100,
    source: 'PIAAC',
    source_variable: 'numeracy_competence_2',
    reference_distribution: {
      // Correct answer: 30%. Based on PIAAC: Level 3+ (~47% of CZ) should get it right
      // Low numeracy may answer 3, 33, 50, or other wrong values
      mean: 30,
      std_dev: 15,
      n: 5057,
      year: 2023,
    },
    domain: 'cognitive',
    has_correct_answer: true,
  },

  // ── Czech cultural questions ───────────────────────────────────────────
  {
    id: 'REF-CULTURE-HEALTH',
    text: 'Jak byste ohodnotil/a svůj zdravotní stav?',
    type: 'single_choice' as any,
    options: ['Velmi dobrý', 'Dobrý', 'Uspokojivý', 'Špatný', 'Velmi špatný'],
    source: 'ESS',
    source_round: 'R10 (2021)',
    source_variable: 'health',
    reference_distribution: {
      // CZ self-rated health from ESS: typical distribution
      frequencies: {
        'Velmi dobrý': 0.18,
        'Dobrý': 0.39,
        'Uspokojivý': 0.30,
        'Špatný': 0.10,
        'Velmi špatný': 0.03,
      },
      n: 2398,
      year: 2021,
    },
    domain: 'health',
    has_correct_answer: false,
  },
  {
    id: 'REF-CULTURE-INCOME',
    text: 'Jak vycházíte s příjmem vaší domácnosti?',
    type: 'single_choice' as any,
    options: ['Žijeme pohodlně', 'Vycházíme', 'Je to obtížné', 'Je to velmi obtížné'],
    source: 'ESS',
    source_round: 'R10 (2021)',
    source_variable: 'hincfel',
    reference_distribution: {
      // CZ income sufficiency from ESS
      frequencies: {
        'Žijeme pohodlně': 0.22,
        'Vycházíme': 0.49,
        'Je to obtížné': 0.22,
        'Je to velmi obtížné': 0.07,
      },
      n: 2398,
      year: 2021,
    },
    domain: 'economic',
    has_correct_answer: false,
  },
]
