# Respondex

Platforma pro simulaci lidských odpovědí na průzkumy pomocí LLM (silicon sampling).

## Co to je

Respondex umožňuje výzkumníkům a marketingovým analytikům spustit syntetické průzkumy nad AI-generovanými respondenty — bez náboru skutečných účastníků. Výsledky jsou určeny pro **pilotní testování dotazníků, explorativní výzkum a metodologické experimenty**.

> **Upozornění:** Výstupy jsou AI-generované a nesmí nahrazovat výzkum se skutečnými respondenty v akademickém nebo komerčním kontextu.

## Architektura

```
respondex/
├── packages/
│   ├── shared/     @respondex/shared — TypeScript typy + Zod schémata + XLSX parsery
│   ├── backend/    @respondex/backend — Azure Functions (Node.js 20, TypeScript)
│   └── frontend/   @respondex/frontend — React 19 + Vite + Tailwind CSS + shadcn/ui
├── infra/          Bicep šablony pro Azure infrastrukturu
├── docs/
│   ├── architecture/ — ADR dokumenty
│   └── prompts/    — Prompt šablony (P01–P10)
└── .github/workflows/ — CI/CD (ci.yml, deploy.yml)
```

### Backend (Azure Functions)
- `POST /api/populations` — import populace z XLSX
- `POST /api/questionnaires` — import dotazníku z XLSX
- `POST /api/simulations` — spuštění simulace (chunked, asynchronní)
- `GET /api/analytics/{id}/summary` — frekvenční tabulky + statistiky
- `GET /api/analytics/{id}/export` — XLSX export výsledků (5 listů)

### Datové úložiště
- **Azure Blob Storage** (`data/`) — JSON data, XLSX soubory
- **Azure Queue Storage** (`simulation-chunks`) — asynchronní chunked zpracování

## Prerekvizity

- Node.js 20+
- pnpm 9+
- Azure CLI (pro deployment)
- OpenAI API klíč

## Lokální setup

```bash
# Klonovat repo
git clone https://github.com/rcendelin/Respondex.git
cd Respondex
git checkout develop

# Nainstalovat závislosti
pnpm install

# Build všech packages
pnpm -r build

# Spustit frontend dev server
pnpm --filter frontend dev

# Spustit backend (vyžaduje Azure Functions Core Tools + Azurite)
# Zkopírovat local.settings.json.example → local.settings.json
# Vyplnit OPENAI_API_KEY a AZURE_STORAGE_CONNECTION_STRING
pnpm --filter backend dev
```

## Konfigurace backendu

Soubor `packages/backend/local.settings.json` (není v git):
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_STORAGE_CONNECTION_STRING": "UseDevelopmentStorage=true",
    "OPENAI_API_KEY": "sk-..."
  }
}
```

## Testování

```bash
# Všechny testy
pnpm test

# Jen backend
pnpm --filter backend test

# Typecheck všeho
pnpm -r typecheck
```

## Deployment na Azure

1. Vytvořit Azure resources:
   ```bash
   az deployment group create \
     --resource-group rg-respondex \
     --template-file infra/main.bicep \
     --parameters @infra/main.parameters.json
   ```
2. Nastavit GitHub Secrets:
   - `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`
3. Push na `main` → automatický deploy přes GitHub Actions

## Fáze vývoje

| Fáze | Status |
|------|--------|
| MVP (Bloky 01-21) | ✅ Hotovo |
| Enhanced (IPF generator, kalibrace) | Plánováno |
| Advanced (Multi-agent, PDF report) | Plánováno |

## Licence

MIT
