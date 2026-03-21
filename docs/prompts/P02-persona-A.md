# P02 — Persona Prompt (Strategie A: Direct Persona)

**Použití:** User message před každou otázkou. Sestavuje se dynamicky — vkládají se pouze neprázdné atributy.

## Šablona (user message)

```
PROFIL RESPONDENTA:
- Věk: {{vek}} let
{{#if pohlavi}}- Pohlaví: {{pohlavi}}
{{/if}}{{#if vzdelani}}- Vzdělání: {{vzdelani}}
{{/if}}{{#if rodinny_stav}}- Rodinný stav: {{rodinny_stav}}
{{/if}}{{#if zamestnani}}- Zaměstnanecký status: {{zamestnani}}
{{/if}}{{#if prijem}}- Příjmové rozpětí: {{prijem}}
{{/if}}{{#if kraj}}- Kraj bydliště: {{kraj}}
{{/if}}{{#if custom_fields}}- Další informace: {{custom_fields}}
{{/if}}
Odpověz na následující otázku jako tento respondent:
{{format_instruction}}
```

## Mapování hodnot

| Pole | Hodnota v TypeScript | Zobrazení v promptu |
|------|---------------------|---------------------|
| `gender` | `Gender.MALE` | `Muž` |
| `gender` | `Gender.FEMALE` | `Žena` |
| `education` | `Education.ELEMENTARY` | `Základní vzdělání` |
| `education` | `Education.HIGH_SCHOOL` | `Středoškolské bez maturity` |
| `education` | `Education.MATURITA` | `Středoškolské s maturitou` |
| `education` | `Education.BACHELOR` | `Bakalářské` |
| `education` | `Education.UNIVERSITY` | `Vysokoškolské (Mgr./Ing. a výše)` |
| `marital_status` | `MaritalStatus.SINGLE` | `Svobodný/á` |
| `marital_status` | `MaritalStatus.MARRIED` | `Ženatý/Vdaná` |
| `marital_status` | `MaritalStatus.DIVORCED` | `Rozvedený/á` |
| `marital_status` | `MaritalStatus.WIDOWED` | `Ovdovělý/á` |
| `employment_status` | `EmploymentStatus.EMPLOYED` | `Zaměstnaný/á` |
| `employment_status` | `EmploymentStatus.SELF_EMPLOYED` | `Podnikatel/ka (OSVČ)` |
| `employment_status` | `EmploymentStatus.UNEMPLOYED` | `Nezaměstnaný/á` |
| `employment_status` | `EmploymentStatus.RETIRED` | `Důchodce/důchodkyně` |
| `employment_status` | `EmploymentStatus.STUDENT` | `Student/ka` |
| `employment_status` | `EmploymentStatus.PARENTAL_LEAVE` | `Na rodičovské dovolené` |
| `income_level` | `IncomeLevel.BELOW_15K` | `Pod 15 000 Kč/měsíc` |
| `income_level` | `IncomeLevel.BETWEEN_15K_30K` | `15 000–30 000 Kč/měsíc` |
| `income_level` | `IncomeLevel.BETWEEN_30K_50K` | `30 000–50 000 Kč/měsíc` |
| `income_level` | `IncomeLevel.ABOVE_50K` | `Nad 50 000 Kč/měsíc` |

## Poznámky

- `{{custom_fields}}` = JSON stringify klíč-hodnota páry z `demographics.custom_fields`
- Prázdné atributy se NEVKLÁDAJÍ (respektuje `exactOptionalPropertyTypes`)
- Format instruction (P10) se přidává na konec jako instrukce pro formát odpovědi
