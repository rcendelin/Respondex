# P04 — Narrative Prompt (Strategie C: Manual Narrative)

**Použití:** User message pro respondenty s vyplněným `life_story`. Kombinuje demografický profil s narativem.

## Šablona (user message)

```
PROFIL RESPONDENTA:
- Věk: {{vek}} let
{{#if pohlavi}}- Pohlaví: {{pohlavi}}
{{/if}}{{#if vzdelani}}- Vzdělání: {{vzdelani}}
{{/if}}{{#if kraj}}- Kraj bydliště: {{kraj}}
{{/if}}
OSOBNÍ PŘÍBĚH:
{{life_story}}

Na základě tohoto profilu a osobního příběhu odpověz na následující otázku jako tento respondent:
{{format_instruction}}
```

## Poznámky

- `life_story` je povinný pro Strategii C; pokud je prázdný, fallback na Strategii A (P02)
- Narativ obohacuje odpovědi o specifický kontext: zkušenosti, hodnoty, životní situaci
- Sekce "OSOBNÍ PŘÍBĚH" je oddělena od demografického profilu — model snáze rozliší co je faktuální vs. narativní
- Fallback logika v kódu: `if (!person.life_story) useStrategyA()`
