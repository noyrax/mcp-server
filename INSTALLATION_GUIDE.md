# Noyrax Unified MCP Server - Installation Guide

## Übersicht

Der Noyrax Unified MCP Server orchestriert beide Plugins (5D Database Plugin + Documentation System Plugin) und bietet einen einheitlichen Zugriff für AI-Agenten (Cursor, Copilot, Claude Desktop).

## Quick Start (5 Minuten)

### Option A: Automatisiertes Setup-Script (Empfohlen)

**Windows (PowerShell):**
```powershell
.\scripts\setup.ps1
# Oder
npm run setup:ps1
```

**Linux/macOS (Bash):**
```bash
./scripts/setup.sh
# Oder
npm run setup:sh
```

Das Script führt alle Schritte automatisch aus und erstellt die Konfigurations-Dateien.

### Option B: Manueller Setup

#### Für bestehendes Monorepo (dieser Workspace)

```bash
# 1. Dependencies installieren
npm install

# 2. Alle Plugins kompilieren
npm run compile:all

# 3. Dokumentation generieren (falls noch nicht vorhanden)
npm run docs:full .

# 4. Datenbanken ingestieren
npm run db:ingest .

# 5. Embeddings generieren
npm run db:embedding .

# 6. MCP Server kompilieren
npm run mcp:build

# 7. Cursor/VS Code konfigurieren (siehe unten)
```

#### Für neues Projekt

```bash
# 1. Workspace klonen/setup
git clone <repo> <workspace>
cd <workspace>

# 2. Dependencies installieren
npm install

# 3. Alle Plugins kompilieren
npm run compile:all

# 4. Vollständiger Workflow (Generate + Ingest + Embeddings)
npm run workflow:full .

# 5. MCP Server kompilieren
npm run mcp:build

# 6. Cursor/VS Code konfigurieren (siehe unten)
```

**Nach dem Quick Start:** Siehe Abschnitt "Verifikation" unten, um zu prüfen, ob alles funktioniert.

## Voraussetzungen

1. **Beide Plugins installiert:**
   - `5d-database-plugin/` im Workspace
   - `documentation-system-plugin/` im Workspace

2. **Node.js:** >= 16.0.0

3. **Dokumentation generiert:**
   - `docs/` Ordner muss existieren (via Documentation System Plugin)

4. **Datenbanken ingestiert:**
   - SQLite-DBs müssen existieren (via 5D Database Plugin)

## Vollständiger Setup (Schritt-für-Schritt)

### Schritt 1: Dependencies installieren

```bash
# Im Root-Workspace
npm install
```

**Verifikation:**
```bash
# Prüfen ob node_modules existieren
Test-Path node_modules
Test-Path 5d-database-plugin/node_modules
Test-Path documentation-system-plugin/node_modules
Test-Path mcp-server/node_modules
```

### Schritt 2: Alle Plugins kompilieren

```bash
# Alle Plugins kompilieren
npm run compile:all

# Oder einzeln
cd documentation-system-plugin && npm run compile
cd 5d-database-plugin && npm run compile
cd mcp-server && npm run compile
```

**Verifikation:**
```bash
# Prüfen ob out/ Verzeichnisse existieren
Test-Path documentation-system-plugin/out
Test-Path 5d-database-plugin/out
Test-Path mcp-server/out/cli/server-cli.js
```

### Schritt 3: Dokumentation generieren

```bash
# Vollständiger Dokumentations-Workflow (Scan → Validate → Generate)
npm run docs:full .

# Oder einzeln
npm run docs:scan .
npm run docs:validate .
npm run docs:generate .
```

**Verifikation:**
```bash
# Prüfen ob docs/ existiert
Test-Path docs/modules
Test-Path docs/index/symbols.jsonl
Test-Path docs/system/DEPENDENCY_GRAPH.md
Test-Path docs/adr
Test-Path docs/system/CHANGE_REPORT.md
```

### Schritt 4: Datenbanken ingestieren

```bash
# Dokumentation in SQLite-DBs ingestieren
npm run db:ingest .

# Oder mit vollständiger Ingestion
node 5d-database-plugin/out/cli/ingest-cli.js . --full
```

**Verifikation:**
```bash
# Prüfen ob SQLite-DBs existieren
Test-Path .database-plugin/modules.db
Test-Path .database-plugin/symbols.db
Test-Path .database-plugin/dependencies.db
Test-Path .database-plugin/adrs.db
Test-Path .database-plugin/changes.db
```

### Schritt 5: Embeddings generieren

```bash
# Embeddings generieren (V-Dimension)
npm run db:embedding .

# Oder via Ingestion (inkl. Embeddings)
node 5d-database-plugin/out/cli/ingest-cli.js . --full
```

**Verifikation:**
```bash
# Prüfen ob Embeddings existieren
Test-Path .database-plugin/vectors.db
# Oder ChromaDB (falls verwendet)
```

### Schritt 6: MCP-Server kompilieren

```bash
# MCP-Server kompilieren
npm run mcp:build

# Oder direkt
cd mcp-server
npm run compile
```

**Verifikation:**
```bash
# Prüfen ob MCP Server kompiliert wurde
Test-Path mcp-server/out/cli/server-cli.js
```

### Schritt 7: MCP-Server testen

```bash
# MCP-Server starten (für Testing)
npm run mcp:start .

# Oder direkt
node mcp-server/out/cli/server-cli.js .
```

**Erwartete Ausgabe:**
```
[UnifiedMcpServer] Initializing...
[UnifiedMcpServer] Database Plugin available: true
[UnifiedMcpServer] Documentation Plugin available: true
[UnifiedMcpServer] Registered 20 tools
[UnifiedMcpServer] Server ready
```

## Konfiguration für AI-Agenten

### Cursor Konfiguration

#### Schritt 1: MCP Config erstellen

Erstellen Sie `.cursor/mcp-config.json` im Workspace-Root:

```json
{
  "mcpServers": {
    "noyrax": {
      "command": "node",
      "args": [
        "${workspaceFolder}/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Wichtig:** 
- Datei muss im Workspace-Root sein (nicht in `.cursor/`)
- Pfad `${workspaceFolder}` wird automatisch durch Cursor aufgelöst
- Falls Probleme: Verwenden Sie absoluten Pfad

#### Schritt 2: Cursor neu starten

1. Cursor vollständig schließen
2. Cursor neu öffnen
3. MCP Server sollte automatisch verbinden

#### Schritt 3: Verifikation

1. Öffnen Sie Cursor Chat
2. Fragen Sie: "Was ist das System?" oder "System-Status prüfen"
3. Der AI-Agent sollte über MCP Server Tools zugreifen können

**Erwartetes Verhalten:**
- AI-Agent nutzt `system_explanation` Tool
- Antwort enthält System-Übersicht, Entry Points, Architecture ADRs
- Keine Fehlermeldungen in Cursor Logs

**Troubleshooting:**
- Prüfen Sie Cursor Logs: `Help` → `Toggle Developer Tools` → `Console`
- Prüfen Sie ob MCP Server startet: `npm run mcp:start .`
- Prüfen Sie ob Konfigurations-Datei korrekt ist

### VS Code Konfiguration

#### Schritt 1: Settings erstellen

Erstellen Sie `.vscode/settings.json` im Workspace-Root:

```json
{
  "mcp.servers": {
    "noyrax": {
      "command": "node",
      "args": [
        "${workspaceFolder}/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Wichtig:**
- Datei muss im `.vscode/` Ordner sein
- Pfad `${workspaceFolder}` wird automatisch durch VS Code aufgelöst
- Falls Probleme: Verwenden Sie absoluten Pfad

#### Schritt 2: VS Code neu laden

1. `Ctrl+Shift+P` (oder `Cmd+Shift+P` auf macOS)
2. Wählen Sie: **"Developer: Reload Window"**
3. MCP Server sollte automatisch verbinden

#### Schritt 3: Verifikation

1. Öffnen Sie GitHub Copilot Chat (oder ähnliches)
2. Fragen Sie: "Was ist das System?" oder "System-Status prüfen"
3. Der AI-Agent sollte über MCP Server Tools zugreifen können

**Erwartetes Verhalten:**
- AI-Agent nutzt `system_explanation` Tool
- Antwort enthält System-Übersicht, Entry Points, Architecture ADRs
- Keine Fehlermeldungen in VS Code Output-Channel

**Troubleshooting:**
- Prüfen Sie VS Code Output-Channel: `View` → `Output` → "MCP" oder "Noyrax"
- Prüfen Sie ob MCP Server startet: `npm run mcp:start .`
- Prüfen Sie ob Konfigurations-Datei korrekt ist

**Option 2: Via Extension**

Falls eine VS Code Extension für MCP verfügbar ist, nutzen Sie diese.

### GitHub Copilot Chat

**Konfiguration in `.copilot/mcp-config.json`:**

```json
{
  "mcpServers": {
    "noyrax": {
      "command": "node",
      "args": [
        "${workspaceFolder}/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ]
    }
  }
}
```

**Hinweis:** GitHub Copilot Chat unterstützt MCP möglicherweise noch nicht vollständig. Prüfen Sie die aktuelle Dokumentation.

### Claude Desktop

**Konfiguration in `claude_desktop_config.json`:**

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

**Konfiguration:**

```json
{
  "mcpServers": {
    "noyrax": {
      "command": "node",
      "args": [
        "D:/path/to/workspace/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ]
    }
  }
}
```

**Hinweis:** Verwenden Sie absolute Pfade für Claude Desktop.

## Verfügbare Tools

### Database Tools (5D Database Plugin)

- `query_modules` - Query modules by file path
- `query_symbols` - Query symbols by path or symbol ID
- `query_dependencies` - Query dependencies by module
- `query_adrs` - Query ADRs by number or path
- `query_changes` - Query change reports
- `cross_analysis` - Cross-dimension analysis
- `semantic_discovery` - Semantic search (uses Semantic Brain)
- `system_explanation` - System overview and entry points
- `learning_path` - Guided learning path
- `bootstrap` - Bootstrap information for first-time understanding
- `gap_analysis` - Find documentation gaps
- `architecture_mining` - Mine architectural decisions
- `generate_documentation` - Generate documentation (Noyrax)
- `check_docs_status` - Check docs/ status

### Validation Tools (Documentation System Plugin)

- `validation/runScan` - Run documentation scan
- `validation/runValidate` - Run documentation validation
- `validation/runDriftCheck` - Check for drift
- `validation/analyzeImpact` - Analyze impact of changes
- `validation/verifyAdrs` - Verify ADR claims

### Orchestration Tools

- `workflow/full_cycle` - Full workflow (Scan → Generate → Validate → Ingest → Embeddings)
- `workflow/generate_and_ingest` - Generate docs and ingest
- `workflow/check_status` - Check system status

## Troubleshooting

### "5D Database Plugin is not available"

**Problem:** 5D Database Plugin wurde nicht gefunden.

**Lösung:**
1. Prüfen Sie, ob `5d-database-plugin/` im Workspace existiert
2. Prüfen Sie, ob `5d-database-plugin/out/api/` existiert (Plugin muss kompiliert sein)
3. Kompilieren Sie das Plugin: `cd 5d-database-plugin && npm run compile`

### "Documentation System Plugin is not available"

**Problem:** Documentation System Plugin wurde nicht gefunden.

**Lösung:**
1. Prüfen Sie, ob `documentation-system-plugin/` im Workspace existiert
2. Prüfen Sie, ob `documentation-system-plugin/out/cli/` existiert (Plugin muss kompiliert sein)
3. Kompilieren Sie das Plugin: `cd documentation-system-plugin && npm run compile`

### "docs/ directory not found"

**Problem:** Dokumentation wurde nicht generiert.

**Lösung:**
1. Generieren Sie die Dokumentation:
   ```bash
   npm run docs:full
   ```
2. Oder nutzen Sie das Tool: `workflow/generate_and_ingest`

### "Databases not found"

**Problem:** SQLite-Datenbanken wurden nicht erstellt.

**Lösung:**
1. Führen Sie Ingestion aus:
   ```bash
   npm run db:ingest
   ```
2. Oder nutzen Sie das Tool: `workflow/generate_and_ingest`

### MCP Server startet nicht

**Problem:** Server kann nicht gestartet werden.

**Lösung:**
1. Prüfen Sie, ob der MCP-Server kompiliert wurde: `npm run mcp:build`
2. Prüfen Sie die Workspace-Root-Erkennung
3. Prüfen Sie die Logs in stderr
4. Prüfen Sie ob beide Plugins kompiliert sind: `npm run compile:all`

### Cursor/VS Code verbindet nicht

**Problem:** MCP Server wird nicht von Cursor/VS Code erkannt.

**Lösung:**
1. Prüfen Sie ob Konfigurations-Datei existiert (`.cursor/mcp-config.json` oder `.vscode/settings.json`)
2. Prüfen Sie ob Pfad korrekt ist (absoluter Pfad falls `${workspaceFolder}` nicht funktioniert)
3. Prüfen Sie ob MCP Server manuell startet: `npm run mcp:start .`
4. Prüfen Sie Cursor/VS Code Logs für Fehlermeldungen
5. Cursor/VS Code neu starten

### Tools funktionieren nicht

**Problem:** Tools geben Fehler zurück oder funktionieren nicht.

**Lösung:**
1. Prüfen Sie ob `docs/` existiert (für Database-Tools)
2. Prüfen Sie ob SQLite-DBs existieren (für Database-Tools)
3. Prüfen Sie ob CLI-Tools kompiliert sind (für Validation-Tools)
4. Prüfen Sie System-Status: `workflow/check_status` Tool nutzen

## Verifikation nach Installation

### Checkliste

Nach der Installation sollten alle folgenden Punkte erfüllt sein:

- [ ] Alle Dependencies installiert (`npm install` erfolgreich)
- [ ] Alle Plugins kompiliert (`npm run compile:all` erfolgreich)
- [ ] Dokumentation generiert (`docs/` existiert mit allen Dimensionen)
- [ ] Datenbanken ingestiert (`.database-plugin/*.db` existieren)
- [ ] Embeddings generiert (`.database-plugin/vectors.db` existiert oder ChromaDB läuft)
- [ ] MCP Server kompiliert (`mcp-server/out/cli/server-cli.js` existiert)
- [ ] Cursor/VS Code konfiguriert (`.cursor/mcp-config.json` oder `.vscode/settings.json` existiert)
- [ ] MCP Server startet (`npm run mcp:start .` erfolgreich)
- [ ] Tools funktionieren (Test: `workflow/check_status`)

### System-Status prüfen

**Via MCP Server (wenn konfiguriert):**

In Cursor/VS Code Chat:
```
System-Status prüfen
```

Oder nutzen Sie das Tool direkt:
```
workflow/check_status
```

**Via CLI (Fallback):**

```bash
# System-Übersicht
node 5d-database-plugin/out/cli/tool-cli.js . system_explanation

# System-Status (falls verfügbar)
node mcp-server/out/cli/server-cli.js .  # MCP Server starten
```

### Erste Nutzung

Nach erfolgreicher Installation können Sie die Tools nutzen:

**In Cursor/VS Code Chat:**
- "Was ist das System?" → Nutzt `system_explanation` Tool
- "Wie funktioniert X?" → Nutzt `semantic_discovery` Tool
- "Welche ADRs gibt es?" → Nutzt `query_adrs` Tool
- "System-Status prüfen" → Nutzt `workflow/check_status` Tool

**Via CLI (Fallback):**
```bash
# System-Übersicht
node 5d-database-plugin/out/cli/tool-cli.js . bootstrap

# Semantic Search
node 5d-database-plugin/out/cli/tool-cli.js . semantic_discovery "Wie funktioniert X?" 5

# ADR abfragen
node 5d-database-plugin/out/cli/query-cli.js . adrs --number 040
```

## Weitere Informationen

- Siehe `README.md` für allgemeine Informationen
- Siehe Konfigurations-Beispiele in `.vscode/`, `.cursor/`, `.copilot/`
- Siehe `5d-database-plugin/SETUP_NEW_PROJECT.md` für vollständigen Setup-Workflow
- Siehe `docs/adr/040-unified-mcp-server-root-architecture.md` für Architektur-Details
- Siehe `docs/adr/041-cursor-rules-update-unified-mcp-server.md` für Cursor Rules Update

