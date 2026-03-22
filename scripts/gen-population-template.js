#!/usr/bin/env node
/**
 * Generates the sample-population.xlsx template with human-readable Czech column names.
 * Run from repo root: node scripts/gen-population-template.js
 */
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')

// xlsx is in shared's node_modules (pnpm workspace)
const XLSX = require(path.join(root, 'packages/shared/node_modules/xlsx'))

// 20 sample persons — P001 must be age:34, Muž, Vysokoškolské, Praha, with life_story
// P003 must have no life_story (test assertion)
const sampleData = [
  { ID: 'P001', 'Věk': 34, 'Pohlaví': 'Muž',  'Vzdělání': 'Vysokoškolské', 'Stav': 'Svobodný/á',   'Partner': 'Ano', 'Status': 'Zaměstnaný/á',        'Příjem': 'Spíše vyšší', 'Kraj': 'Praha',          'Životní příběh': 'Vystudoval informatiku na ČVUT. Pracuje jako softwarový inženýr v pražském startupu. Ve volném čase rád čte a chodí na výlety do přírody.' },
  { ID: 'P002', 'Věk': 71, 'Pohlaví': 'Žena', 'Vzdělání': 'S maturitou',    'Stav': 'Ovdovělý/á',   'Partner': 'Ne',  'Status': 'Důchodce/kyně',       'Příjem': 'Střední',     'Kraj': 'Jihomoravský',   'Životní příběh': 'Celý život pracovala jako účetní. Po odchodu do důchodu se věnuje zahrádkaření a vnoučatům.' },
  { ID: 'P003', 'Věk': 45, 'Pohlaví': 'Muž',  'Vzdělání': 'Vyučení',        'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Zaměstnaný/á',        'Příjem': 'Střední',     'Kraj': 'Moravskoslezský', 'Životní příběh': '' },
  { ID: 'P004', 'Věk': 28, 'Pohlaví': 'Žena', 'Vzdělání': 'Vysokoškolské',  'Stav': 'Svobodný/á',   'Partner': 'Ano', 'Status': 'Zaměstnaný/á',        'Příjem': 'Nízký',       'Kraj': 'Praha',          'Životní příběh': '' },
  { ID: 'P005', 'Věk': 62, 'Pohlaví': 'Muž',  'Vzdělání': 'S maturitou',    'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Důchodce/kyně',       'Příjem': 'Spíše nižší', 'Kraj': 'Středočeský',   'Životní příběh': '' },
  { ID: 'P006', 'Věk': 38, 'Pohlaví': 'Žena', 'Vzdělání': 'Vyšší odborné',  'Stav': 'Rozvedený/á',  'Partner': 'Ne',  'Status': 'Zaměstnaný/á',        'Příjem': 'Střední',     'Kraj': 'Plzeňský',      'Životní příběh': '' },
  { ID: 'P007', 'Věk': 54, 'Pohlaví': 'Muž',  'Vzdělání': 'S maturitou',    'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Podnikatel/ka (OSVČ)', 'Příjem': 'Vysoký',      'Kraj': 'Jihočeský',     'Životní příběh': '' },
  { ID: 'P008', 'Věk': 33, 'Pohlaví': 'Žena', 'Vzdělání': 'Vysokoškolské',  'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Mateřská/rodičovská dovolená', 'Příjem': 'Střední', 'Kraj': 'Jihomoravský', 'Životní příběh': '' },
  { ID: 'P009', 'Věk': 22, 'Pohlaví': 'Muž',  'Vzdělání': 'S maturitou',    'Stav': 'Svobodný/á',   'Partner': 'Ne',  'Status': 'Student/ka',          'Příjem': 'Nízký',       'Kraj': 'Olomoucký',     'Životní příběh': '' },
  { ID: 'P010', 'Věk': 48, 'Pohlaví': 'Žena', 'Vzdělání': 'Základní',       'Stav': 'Rozvedený/á',  'Partner': 'Ne',  'Status': 'Nezaměstnaný/á',      'Příjem': 'Nízký',       'Kraj': 'Ústecký',       'Životní příběh': '' },
  { ID: 'P011', 'Věk': 41, 'Pohlaví': 'Muž',  'Vzdělání': 'Vysokoškolské',  'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Zaměstnaný/á',        'Příjem': 'Spíše vyšší', 'Kraj': 'Praha',          'Životní příběh': '' },
  { ID: 'P012', 'Věk': 67, 'Pohlaví': 'Žena', 'Vzdělání': 'Vyučení',        'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Důchodce/kyně',       'Příjem': 'Spíše nižší', 'Kraj': 'Zlínský',       'Životní příběh': '' },
  { ID: 'P013', 'Věk': 25, 'Pohlaví': 'Žena', 'Vzdělání': 'S maturitou',    'Stav': 'Svobodný/á',   'Partner': 'Ne',  'Status': 'Zaměstnaný/á',        'Příjem': 'Nízký',       'Kraj': 'Liberecký',     'Životní příběh': '' },
  { ID: 'P014', 'Věk': 57, 'Pohlaví': 'Muž',  'Vzdělání': 'Vyšší odborné',  'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Zaměstnaný/á',        'Příjem': 'Střední',     'Kraj': 'Karlovarský',   'Životní příběh': '' },
  { ID: 'P015', 'Věk': 30, 'Pohlaví': 'Žena', 'Vzdělání': 'Vysokoškolské',  'Stav': 'Svobodný/á',   'Partner': 'Ano', 'Status': 'Zaměstnaný/á',        'Příjem': 'Střední',     'Kraj': 'Pardubický',    'Životní příběh': '' },
  { ID: 'P016', 'Věk': 73, 'Pohlaví': 'Muž',  'Vzdělání': 'S maturitou',    'Stav': 'Ovdovělý/á',   'Partner': 'Ne',  'Status': 'Důchodce/kyně',       'Příjem': 'Střední',     'Kraj': 'Královéhradecký', 'Životní příběh': '' },
  { ID: 'P017', 'Věk': 36, 'Pohlaví': 'Žena', 'Vzdělání': 'Základní',       'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Nezaměstnaný/á',      'Příjem': 'Nízký',       'Kraj': 'Moravskoslezský', 'Životní příběh': '' },
  { ID: 'P018', 'Věk': 44, 'Pohlaví': 'Muž',  'Vzdělání': 'Vyučení',        'Stav': 'Rozvedený/á',  'Partner': 'Ne',  'Status': 'Zaměstnaný/á',        'Příjem': 'Spíše nižší', 'Kraj': 'Kraj Vysočina',  'Životní příběh': '' },
  { ID: 'P019', 'Věk': 52, 'Pohlaví': 'Žena', 'Vzdělání': 'S maturitou',    'Stav': 'Ženatý/Vdaná', 'Partner': 'Ano', 'Status': 'Podnikatel/ka (OSVČ)', 'Příjem': 'Spíše vyšší', 'Kraj': 'Jihočeský',     'Životní příběh': '' },
  { ID: 'P020', 'Věk': 19, 'Pohlaví': 'Muž',  'Vzdělání': 'S maturitou',    'Stav': 'Svobodný/á',   'Partner': 'Ne',  'Status': 'Student/ka',          'Příjem': 'Nízký',       'Kraj': 'Středočeský',   'Životní příběh': '' },
]

const helpRows = [
  { Sloupec: 'ID',              Povinné: 'Ano', Popis: 'Unikátní identifikátor osoby (libovolný řetězec)',    'Povolené hodnoty': 'P001, R0001, OSOBA_001, ...' },
  { Sloupec: 'Věk',             Povinné: 'Ano', Popis: 'Věk v celých letech, rozsah 18–100',                   'Povolené hodnoty': 'celé číslo 18–100' },
  { Sloupec: 'Pohlaví',         Povinné: 'Ano', Popis: 'Pohlaví osoby',                                        'Povolené hodnoty': 'Muž | Žena' },
  { Sloupec: 'Vzdělání',        Povinné: 'Ne',  Popis: 'Nejvyšší dosažené vzdělání',                          'Povolené hodnoty': 'Základní | Vyučení | S maturitou | Vyšší odborné | Vysokoškolské' },
  { Sloupec: 'Stav',            Povinné: 'Ne',  Popis: 'Rodinný stav',                                        'Povolené hodnoty': 'Svobodný/á | Ženatý/Vdaná | Rozvedený/á | Ovdovělý/á | Registrované partnerství' },
  { Sloupec: 'Partner',         Povinné: 'Ne',  Popis: 'Má aktuálního partnera/partnerku',                    'Povolené hodnoty': 'Ano | Ne' },
  { Sloupec: 'Status',          Povinné: 'Ne',  Popis: 'Pracovní status',                                     'Povolené hodnoty': 'Zaměstnaný/á | Podnikatel/ka (OSVČ) | Nezaměstnaný/á | Student/ka | Důchodce/kyně | Mateřská/rodičovská dovolená | Jiné' },
  { Sloupec: 'Příjem',          Povinné: 'Ne',  Popis: 'Příjmová skupina',                                    'Povolené hodnoty': 'Nízký | Spíše nižší | Střední | Spíše vyšší | Vysoký' },
  { Sloupec: 'Kraj',            Povinné: 'Ne',  Popis: 'Kraj bydliště',                                       'Povolené hodnoty': 'Praha | Středočeský | Jihočeský | Plzeňský | Karlovarský | Ústecký | Liberecký | Královéhradecký | Pardubický | Kraj Vysočina | Jihomoravský | Olomoucký | Zlínský | Moravskoslezský' },
  { Sloupec: 'Životní příběh',  Povinné: 'Ne',  Popis: 'Volný text s životním příběhem (pro Strategii C — manuální narativ)', 'Povolené hodnoty': 'libovolný text' },
]

const wb = XLSX.utils.book_new()

const wsOsoby = XLSX.utils.json_to_sheet(sampleData)
wsOsoby['!cols'] = [
  { wch: 6 },  // ID
  { wch: 5 },  // Věk
  { wch: 9 },  // Pohlaví
  { wch: 16 }, // Vzdělání
  { wch: 17 }, // Stav
  { wch: 8 },  // Partner
  { wch: 32 }, // Status
  { wch: 13 }, // Příjem
  { wch: 18 }, // Kraj
  { wch: 60 }, // Životní příběh
]
XLSX.utils.book_append_sheet(wb, wsOsoby, 'Osoby')

const wsHelp = XLSX.utils.json_to_sheet(helpRows)
wsHelp['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 55 }, { wch: 100 }]
XLSX.utils.book_append_sheet(wb, wsHelp, 'Nápověda')

const outPath = path.join(root, 'templates', 'sample-population.xlsx')
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
fs.writeFileSync(outPath, buf)
console.log('✓ templates/sample-population.xlsx vygenerován (20 osob, nové české názvy sloupců)')
