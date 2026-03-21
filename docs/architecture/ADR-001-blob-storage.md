# ADR-001: Azure Blob Storage jako primární úložiště

**Datum:** 2026-03-21
**Status:** Přijato

## Kontext

Respondex potřebuje ukládat populace (JSON pole osob), dotazníky, meta-data simulací a výsledky odpovědí (JSON pole per chunk). Data jsou strukturovaná, ale velikosti a přístupové vzory jsou variabilní.

## Rozhodnutí

Používáme **Azure Blob Storage** (container `data`) jako primární úložiště pro všechna persistentní data.

Struktura cest:
```
data/
  populations/{id}/meta.json
  populations/{id}/persons.json
  questionnaires/{id}/meta.json
  questionnaires/{id}/questions.json
  simulations/{id}/meta.json
  simulations/{id}/responses/chunk-001.json
  simulations/{id}/analytics.json
  templates/population.xlsx
  templates/questionnaire.xlsx
  calibration/reference-dataset.json
```

## Důvody

1. **Serverless alignment**: Azure Functions Consumption plan — žádný trvalý server, který by hostoval databázi.
2. **Jednoduchost MVP**: Žádná schémata, migrace, connection pool management.
3. **Cena**: Blob Storage je řádově levnější než Cosmos DB nebo Azure SQL pro malý provoz.
4. **JSON-first**: Data jsou přirozeně JSON; Blob Storage nevyžaduje serializační vrstvy.
5. **Chunk pattern**: Výsledky simulací jsou přirozeně rozděleny do souborů (chunk-001.json, chunk-002.json, ...) — Blob Storage přirozeně podporuje tento vzor.

## Nevýhody a přijatá rizika

1. **Žádné transakce**: Aktualizace `meta.json` (completed_chunks++) není atomická. Race condition možná při souběžném zpracování chunků. Dokumentováno v kódu; pro MVP přijatelné.
2. **Žádné dotazy**: Nelze efektivně filtrovat, třídit, ani agregovat bez načtení všech blobů. Pro seznam simulací čteme všechny `meta.json` — únosné do ~1000 simulací.
3. **Žádná ACID**: Pokud agent selže po zápisu `persons.json` ale před `meta.json`, data jsou nekonzistentní. Mitigation: meta se zapisuje jako poslední.

## Alternativy zváženy

- **Azure Cosmos DB (NoSQL)**: Plně konzistentní, dotazovatelné. Cena ~10× vyšší při nízké zátěži. Komplexnější setup. Doporučeno pro Fázi 2.
- **Azure SQL**: Relační model neodpovídá flexibilní struktuře demographics. Schema migrace nákladná pro iterace.
- **Azure Table Storage**: Levné, ale omezené dotazování a slabý TypeScript SDK.

## Doporučení pro Fázi 2

Migrovat `meta.json` záznamy (simulace, populace) do **Azure Cosmos DB** s `id` jako partition key. Výsledky odpovědí (`chunk-*.json`) ponechat v Blob Storage.
