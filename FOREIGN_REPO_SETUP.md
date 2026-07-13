# Fremd-Repo Setup - Noyrax MCP Server

## Quick Start (Empfohlen)

**Ein Befehl - Alles automatisch:**

**Windows (PowerShell):**
```powershell
.\scripts\setup-foreign.ps1
# Oder
npm run setup:foreign:ps1
```

**Linux/macOS (Bash):**
```bash
./scripts/setup-foreign.sh
# Oder
npm run setup:foreign:sh
```

Das Script führt automatisch aus:
- ✅ Installiert alle benötigten npm Packages
- ✅ Erkennt automatisch installierte IDEs (Cursor, VS Code, Claude Desktop)
- ✅ Erstellt Konfigurationsdateien für alle erkannten IDEs
- ✅ Verifiziert Installation

## Problem

Der MCP-Server zeigt Tools/Resources in der UI, aber beim Aufruf von Tools (z.B. `workflow/check_status`) meldet Cursor: **"Found 0 tools, 0 prompts, and 0 resources"**.

**Ursache:** Der Unified MCP Server benötigt zwei Plugins, die im Fremd-Repo nicht installiert sind:
1. `@noyrax/5d-database-plugin` - für Database Tools
2. `@noyrax/documentation-system-plugin` - für Validation Tools

## Lösung (Automatisiert)

### Schritt 1: Setup-Script ausführen

**Windows:**
```powershell
.\scripts\setup-foreign.ps1
```

**Linux/macOS:**
```bash
./scripts/setup-foreign.sh
```

Das Script installiert automatisch:
- `@noyrax/mcp-server@1.0.4-beta.19` - der Unified Server
- `@noyrax/5d-database-plugin@0.1.14-beta.8` - für Database Tools
- `@noyrax/documentation-system-plugin@1.0.4-beta.2` - für Validation Tools

### Schritt 2: IDE neu starten

1. Cursor/VS Code/Claude Desktop **komplett schließen**
2. Cursor/VS Code/Claude Desktop **neu öffnen**
3. Prüfen: `View → MCP Servers` → `noyrax` sollte jetzt Tools/Resources zeigen

### Schritt 3: Verifikation

Im Cursor Chat testen:

```
System-Status prüfen
```

→ Sollte `workflow/check_status` automatisch nutzen und einen Status-Report zurückgeben.

## Lösung (Manuell)

Falls das automatische Script nicht funktioniert:

### Schritt 1: Plugins installieren

Im Fremd-Repo (z.B. `D:\ai-agent-system`):

```powershell
npm i -D @noyrax/mcp-server@latest @noyrax/5d-database-plugin@0.1.14-beta.8 @noyrax/documentation-system-plugin@1.0.4-beta.2
```

**Hinweis:** `@noyrax/mcp-server@latest` verwendet Version `1.0.4-beta.20`, die korrekte Dependencies hat (keine `file:` Dependencies mehr).

**Wichtig:** Alle drei Pakete müssen installiert sein:
- `@noyrax/mcp-server` - der Unified Server
- `@noyrax/5d-database-plugin` - für Database Tools
- `@noyrax/documentation-system-plugin` - für Validation Tools

### Schritt 2: IDE konfigurieren

**Cursor:** Erstellen Sie `.cursor/mcp-config.json`:
```json
{
  "mcpServers": {
    "noyrax": {
      "command": "node",
      "args": [
        "${workspaceFolder}/node_modules/@noyrax/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**VS Code:** Erstellen/aktualisieren Sie `.vscode/settings.json`:
```json
{
  "mcp.servers": {
    "noyrax": {
      "command": "node",
      "args": [
        "${workspaceFolder}/node_modules/@noyrax/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Claude Desktop:** Siehe `INSTALLATION_FOR_AI_AGENTS.md` für Details.

### Schritt 3: IDE neu starten

1. Cursor/VS Code/Claude Desktop **komplett schließen**
2. Cursor/VS Code/Claude Desktop **neu öffnen**
3. Prüfen: `View → MCP Servers` → `noyrax` sollte jetzt Tools/Resources zeigen

## Warum funktioniert es jetzt?

Ab `@noyrax/mcp-server@1.0.4-beta.9` sucht der Server die Plugins in:

1. **Workspace-Root** (als Ordner): `workspace/5d-database-plugin/`
2. **Workspace node_modules**: `workspace/node_modules/@noyrax/5d-database-plugin/`
3. **MCP-Server node_modules** (Fallback): `node_modules/@noyrax/mcp-server/node_modules/@noyrax/5d-database-plugin/`

Damit findet der Server die Plugins, auch wenn sie nur im Workspace-Root installiert sind.

## Troubleshooting

### Problem: "Found 0 tools, 0 prompts, and 0 resources"

**Prüfen:**
1. Alle drei Pakete installiert? → `npm list @noyrax/mcp-server @noyrax/5d-database-plugin @noyrax/documentation-system-plugin`
2. Plugins kompiliert? → `Test-Path node_modules/@noyrax/5d-database-plugin/out/api` (sollte `True` sein)
3. Cursor neu gestartet? → Komplett schließen und neu öffnen

### Problem: Plugins nicht gefunden

**Prüfen:**
- MCP Logs: `View → Output → MCP Logs`
- Sollte zeigen: `[NOYRAX-MCP] Server started successfully`
- Falls Fehler: Plugin-Pfade prüfen

### Problem: Tools funktionieren nicht

**Prüfen:**
- `docs/` existiert? → `Test-Path docs/modules`
- Falls nicht: `workflow/ensure_ready` ausführen (falls verfügbar)
- Oder: `workflow/onboard` ausführen (generiert `docs/` automatisch)

### Problem: Script findet IDEs nicht

**Lösung:** Konfigurieren Sie manuell - siehe oben "Lösung (Manuell)"

## Nächste Schritte

Nach erfolgreicher Installation:

1. **Onboarding:** `workflow/onboard` ausführen (generiert `docs/` und initialisiert Datenbanken)
2. **Status prüfen:** `workflow/check_status` ausführen
3. **Dokumentation generieren:** `workflow/generate_and_ingest` ausführen

## Vollständige Installation (One-Liner)

**Automatisiert (Empfohlen):**
```powershell
# Windows
.\scripts\setup-foreign.ps1

# Linux/macOS
./scripts/setup-foreign.sh
```

**Manuell:**
```powershell
npm i -D @noyrax/mcp-server@latest @noyrax/5d-database-plugin@0.1.14-beta.8 @noyrax/documentation-system-plugin@1.0.4-beta.2
```

**Hinweis:** `@noyrax/mcp-server@latest` verwendet Version `1.0.4-beta.20`, die korrekte Dependencies hat.

Dann IDE neu starten.

## Weitere Informationen

- `FREMDSYSTEM_INSTALLATION_FINAL.md` - Vereinfachte Installationsanleitung
- `INSTALLATION_FOR_AI_AGENTS.md` - Vollständige Installationsanleitung für AI-Agenten
- `INSTALLATION_GUIDE.md` - Detaillierte MCP Server Installationsanleitung
