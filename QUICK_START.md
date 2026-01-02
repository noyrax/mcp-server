# Quick Start - Noyrax Unified MCP Server

## Schnellstart in 3 Schritten

### Schritt 1: Dependencies installieren

```bash
# Im Root-Workspace
npm install
```

### Schritt 2: MCP-Server kompilieren

```bash
# MCP-Server kompilieren
npm run mcp:build

# Oder direkt im mcp-server Ordner
cd mcp-server
npm run compile
```

### Schritt 3: MCP-Server starten

**Option 1: Im Root-Verzeichnis (automatische Workspace-Erkennung)**
```bash
# Im Root-Workspace - Workspace-Root wird automatisch erkannt
npm run mcp:start
```

**Option 2: Mit explizitem Workspace-Root**
```bash
# Im Root-Workspace mit explizitem Pfad
npm run mcp:start .
```

**Option 3: Im mcp-server Verzeichnis**
```bash
# Im mcp-server Verzeichnis - Workspace-Root wird automatisch erkannt
cd mcp-server
npm run mcp:start
```

**Option 4: Direkt**
```bash
# Von überall - Workspace-Root wird automatisch erkannt
node mcp-server/out/cli/server-cli.js

# Oder mit explizitem Pfad
node mcp-server/out/cli/server-cli.js .
```

## Konfiguration für AI-Agenten

### VS Code

Erstellen Sie `.vscode/settings.json`:

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

Erstellen Sie `.cursor/mcp-config.json`:

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

Fügen Sie zu `claude_desktop_config.json` hinzu (Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "noyrax": {
      "command": "node",
      "args": [
        "D:/Datenbank für Noyrax/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ]
    }
  }
}
```

**WICHTIG:** Verwenden Sie absolute Pfade für Claude Desktop!

## Verfügbare Tools testen

Nach dem Start können Sie folgende Tools nutzen:

### Database Tools
- `bootstrap` - Erste Anlaufstelle
- `semantic_discovery` - Semantic Search (nutzt Semantic Brain)
- `system_explanation` - System-Übersicht
- `query_modules`, `query_symbols`, etc.

### Validation Tools
- `validation/runScan` - Dokumentations-Scan
- `validation/runValidate` - Dokumentations-Validierung
- `validation/verifyAdrs` - ADR-Verification

### Orchestration Tools
- `workflow/check_status` - System-Status prüfen
- `workflow/full_cycle` - Vollständiger Workflow
- `workflow/generate_and_ingest` - Generate + Ingest

## Troubleshooting

### "Plugin is not available"

**Lösung:** Stellen Sie sicher, dass beide Plugins kompiliert sind:

```bash
# Beide Plugins kompilieren
npm run compile:all
```

### "docs/ directory not found"

**Lösung:** Generieren Sie die Dokumentation:

```bash
# Dokumentation generieren
npm run docs:full
```

### "Databases not found"

**Lösung:** Führen Sie Ingestion aus:

```bash
# Ingestion ausführen
npm run db:ingest
```

## Nächste Schritte

1. **Konfiguration anpassen** - Siehe [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)
2. **Tools testen** - Starten Sie den Server und testen Sie die Tools
3. **Integration** - Integrieren Sie den Server in VS Code/Cursor/Copilot

Siehe [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) für detaillierte Anleitung.

