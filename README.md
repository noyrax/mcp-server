# @noyrax/mcp-server

**Unified MCP Server for Noyrax Workspace** - Orchestrates both plugins (5D Database Plugin + Documentation System Plugin) and provides centralized access for AI agents (Cursor, VS Code, Claude Desktop).

## Quick Start

### Installation

```bash
npm install -g @noyrax/mcp-server
```

### Configuration

**Cursor:** Create `.cursor/mcp-config.json`:
```json
{
  "mcpServers": {
    "noyrax": {
      "command": "noyrax-mcp-server",
      "args": ["${workspaceFolder}"]
    }
  }
}
```

**VS Code:** Add to `.vscode/settings.json`:
```json
{
  "mcp.servers": {
    "noyrax": {
      "command": "noyrax-mcp-server",
      "args": ["${workspaceFolder}"]
    }
  }
}
```

### First Steps

1. Restart Cursor/VS Code
2. Ask in Chat: "What is the system?" or "System status check"
3. The AI agent should access tools via MCP Server

See [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) for detailed setup.

## Overview

Der Noyrax Unified MCP Server ist ein **Root-Level MCP-Server**, der beide Plugins koordiniert:

- **5D Database Plugin** - Datenbank-Queries, Semantic Search, System-Analyse
- **Documentation System Plugin** - Dokumentations-Generierung, Validierung, Drift-Detection

## Architektur

```
VS Code/Cursor/Copilot
    ↓ (MCP Protocol)
Root MCP-Server
    ├── Database Tools → 5D Database Plugin APIs
    ├── Validation Tools → Documentation System Plugin CLI
    └── Orchestration Tools → Workflow-Koordination
```

## Features

### Database Tools (5D Database Plugin)

- **Queries:** `query_modules`, `query_symbols`, `query_dependencies`, `query_adrs`, `query_changes`
- **Semantic Search:** `semantic_discovery` (nutzt Semantic Brain)
- **System-Analyse:** `system_explanation`, `learning_path`, `bootstrap`
- **Advanced:** `cross_analysis`, `gap_analysis`, `architecture_mining`
- **Workflow:** `generate_documentation`, `check_docs_status`

### Validation Tools (Documentation System Plugin)

- `validation/runScan` - Dokumentations-Scan
- `validation/runValidate` - Dokumentations-Validierung
- `validation/runDriftCheck` - Drift-Detection
- `validation/analyzeImpact` - Impact-Analyse
- `validation/verifyAdrs` - ADR-Verification

### Orchestration Tools

- `workflow/full_cycle` - Vollständiger Workflow (Scan → Generate → Validate → Ingest → Embeddings)
- `workflow/generate_and_ingest` - Generate Docs + Ingest
- `workflow/check_status` - System-Status prüfen

## Installation

Siehe [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) für detaillierte Anleitung.

### Schnellstart

```bash
# Dependencies installieren
npm install

# MCP-Server kompilieren
npm run mcp:build

# MCP-Server starten
npm run mcp:start <workspace-root>
```

## Konfiguration

### VS Code

Fügen Sie zu `.vscode/settings.json` hinzu:

```json
{
  "mcp.servers": {
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

### Cursor

Fügen Sie zu `.cursor/mcp-config.json` hinzu:

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

### Claude Desktop

Fügen Sie zu `claude_desktop_config.json` hinzu:

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

Siehe [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) für vollständige Konfiguration.

## Workspace-Erkennung

Der MCP-Server unterstützt verschiedene Workspace-Konfigurationen:

- **Single-Root-Workspace** - Standard-Workspace
- **Multi-Root-Workspace** - Mehrere Workspace-Ordner
- **VS Code Workspace-File** - `.code-workspace` Dateien
- **Cursor Workspace** - Cursor-spezifische Konfiguration

Der Server erkennt automatisch:
- Workspace-Root
- Plugin-Pfade (`5d-database-plugin/`, `documentation-system-plugin/`)
- Dokumentations-Pfad (`docs/`)
- Datenbank-Pfad (`.database-plugin/`)

## Semantic Brain Integration

**Semantic Brain ist bereits vollständig integriert** über das `semantic_discovery` Tool:

- Nutzt `SemanticSearchApi` aus 5D Database Plugin
- Generiert Embeddings via `EmbeddingGenerator`
- Speichert in Vektordatenbank (SQLite VSS oder ChromaDB)
- Keine zusätzlichen Tools nötig

## Migration von alten MCP-Servern

**WICHTIG:** Die alten MCP-Server wurden entfernt:

- ❌ `documentation-system-plugin/mcp/src/server.ts` - Entfernt
- ❌ `documentation-system-plugin/packages/doc-system-agent/src/mcp/server.ts` - Entfernt

**Neue Nutzung:**

- ✅ `mcp-server/` im Root-Workspace - Einheitlicher Server

Siehe [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) für Migrations-Anleitung.

## Troubleshooting

### Plugin nicht gefunden

**Problem:** "5D Database Plugin is not available" oder "Documentation System Plugin is not available"

**Lösung:**
1. Prüfen Sie, ob beide Plugins im Workspace existieren
2. Kompilieren Sie die Plugins: `npm run compile:all`
3. Prüfen Sie die Plugin-Pfade in `WorkspaceResolver.findPluginPaths()`

### Workspace-Root nicht erkannt

**Problem:** Workspace-Root wird nicht korrekt erkannt

**Lösung:**
1. Geben Sie den Workspace-Root explizit an: `npm run mcp:start <workspace-root>`
2. Prüfen Sie, ob `.code-workspace` Dateien korrekt sind
3. Nutzen Sie absoluten Pfad für Claude Desktop

### Tools funktionieren nicht

**Problem:** Tools geben Fehler zurück

**Lösung:**
1. Prüfen Sie, ob `docs/` existiert (für Database-Tools)
2. Prüfen Sie, ob SQLite-DBs existieren (für Database-Tools)
3. Prüfen Sie, ob CLI-Tools kompiliert sind (für Validation-Tools)

## Entwicklung

### Projekt-Struktur

```
mcp-server/
├── src/
│   ├── server.ts                    # Haupt-MCP-Server
│   ├── workspace-resolver.ts        # Workspace-Erkennung
│   ├── cli/
│   │   └── server-cli.ts            # CLI Entry Point
│   ├── plugins/
│   │   ├── database-plugin-adapter.ts
│   │   └── documentation-plugin-adapter.ts
│   └── tools/
│       ├── database-tools.ts
│       ├── validation-tools.ts
│       └── orchestration-tools.ts
├── package.json
├── tsconfig.json
└── README.md
```

### Build

```bash
# Kompilieren
npm run compile

# Watch-Mode
npm run watch
```

### Testing

```bash
# MCP-Server starten (für Testing)
npm run mcp:start <workspace-root>
```

## Weitere Informationen

- [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) - Vollständige Installations-Anleitung
- [5d-database-plugin/MCP_SERVER_SETUP.md](../5d-database-plugin/MCP_SERVER_SETUP.md) - Database-Tools Details
- [documentation-system-plugin/MCP_SERVER_SETUP.md](../documentation-system-plugin/MCP_SERVER_SETUP.md) - Validation-Tools Details

## Lizenz

MIT

