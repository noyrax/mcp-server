# Agent-Konfiguration Proof Steps

**Datum:** 2025-12-29  
**Zweck:** Reproduzierbare Proof Steps für Agent-Konfigurationen (Cursor, VS Code, Claude Desktop)

## Übersicht

Dieses Dokument beschreibt die konkreten Schritte zur Verifikation, dass die MCP-Server-Konfiguration für verschiedene AI-Agenten funktioniert.

## Voraussetzungen

- ✅ MCP-Server kompiliert: `mcp-server/out/cli/server-cli.js` existiert
- ✅ Beide Plugins kompiliert: `5d-database-plugin/out/` und `documentation-system-plugin/out/` existieren
- ✅ Dokumentation generiert: `docs/` existiert (optional, aber empfohlen)
- ✅ Datenbanken ingestiert: `.database-plugin/` existiert (optional, aber empfohlen)

## Proof Steps: Cursor

### Schritt 1: Konfiguration erstellen

**Datei:** `.cursor/mcp-config.json` (im Workspace-Root)

**Inhalt:**
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

**Verifikation:**
```powershell
# Prüfen ob Datei existiert
Test-Path .cursor/mcp-config.json

# Prüfen ob Inhalt korrekt ist
Get-Content .cursor/mcp-config.json | ConvertFrom-Json
```

### Schritt 2: Cursor neu starten

1. Cursor vollständig schließen (nicht nur Fenster schließen)
2. Cursor neu öffnen
3. Workspace öffnen

**Erwartetes Verhalten:**
- Keine Fehlermeldungen beim Start
- MCP Server sollte automatisch verbinden

### Schritt 3: MCP Server Status prüfen

**In Cursor Chat:**
```
System-Status prüfen
```

**Oder direkt Tool aufrufen:**
```
workflow/check_status
```

**Erwartetes Verhalten:**
- AI-Agent nutzt `workflow/check_status` Tool
- Antwort enthält Status-Informationen (docs/, databases, plugins)
- Keine Fehlermeldungen

### Schritt 4: Weitere Tools testen

**Test 1: System-Erklärung**
```
Was ist das System?
```

**Erwartetes Verhalten:**
- AI-Agent nutzt `system_explanation` Tool
- Antwort enthält System-Übersicht, Entry Points, Architecture ADRs

**Test 2: Bootstrap**
```
Bootstrap-Informationen abrufen
```

**Erwartetes Verhalten:**
- AI-Agent nutzt `bootstrap` Tool
- Antwort enthält First-Contact-Informationen

**Test 3: Semantic Discovery**
```
Wie funktioniert der ContextBuilder?
```

**Erwartetes Verhalten:**
- AI-Agent nutzt `semantic_discovery` Tool
- Antwort enthält relevante Module, ADRs, Symbols

### Schritt 5: Fehlerbehandlung testen

**Test: Fehlende Dokumentation**
1. Temporär `docs/` umbenennen (z.B. `docs_backup`)
2. Tool aufrufen: `workflow/check_status`
3. `docs/` wiederherstellen

**Erwartetes Verhalten:**
- Tool gibt Fehler zurück (docs/ fehlt)
- Fehlermeldung ist klar und hilfreich
- Kein Crash des Servers

## Proof Steps: VS Code

### Schritt 1: Konfiguration erstellen

**Datei:** `.vscode/settings.json` (im Workspace-Root)

**Inhalt:**
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

**Verifikation:**
```powershell
# Prüfen ob Datei existiert
Test-Path .vscode/settings.json

# Prüfen ob Inhalt korrekt ist
Get-Content .vscode/settings.json | ConvertFrom-Json
```

### Schritt 2: VS Code neu laden

1. `Ctrl+Shift+P` (oder `Cmd+Shift+P` auf macOS)
2. Wählen Sie: **"Developer: Reload Window"**
3. Warten auf Neuladen

**Erwartetes Verhalten:**
- Keine Fehlermeldungen beim Neuladen
- MCP Server sollte automatisch verbinden

### Schritt 3: MCP Server Status prüfen

**In VS Code Chat (GitHub Copilot Chat oder ähnliches):**
```
System-Status prüfen
```

**Oder Output-Channel prüfen:**
1. `View` → `Output`
2. Wählen Sie "MCP" oder "Noyrax" aus
3. Prüfen Sie auf Fehlermeldungen

**Erwartetes Verhalten:**
- AI-Agent nutzt `workflow/check_status` Tool
- Antwort enthält Status-Informationen
- Keine Fehlermeldungen im Output-Channel

### Schritt 4: Weitere Tools testen

**Gleiche Tests wie bei Cursor (siehe oben)**

## Proof Steps: Claude Desktop

### Schritt 1: Konfiguration erstellen

**Datei:** `claude_desktop_config.json`

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

**Inhalt (Windows-Beispiel):**
```json
{
  "mcpServers": {
    "noyrax": {
      "command": "node",
      "args": [
        "D:/Datenbank für Noyrax/mcp-server/out/cli/server-cli.js",
        "D:/Datenbank für Noyrax"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**WICHTIG:** Verwenden Sie absolute Pfade für Claude Desktop!

**Verifikation:**
```powershell
# Windows: Prüfen ob Datei existiert
Test-Path "$env:APPDATA\Claude\claude_desktop_config.json"

# Prüfen ob Inhalt korrekt ist
Get-Content "$env:APPDATA\Claude\claude_desktop_config.json" | ConvertFrom-Json
```

### Schritt 2: Claude Desktop neu starten

1. Claude Desktop vollständig schließen
2. Claude Desktop neu öffnen
3. Workspace öffnen (falls unterstützt)

**Erwartetes Verhalten:**
- Keine Fehlermeldungen beim Start
- MCP Server sollte automatisch verbinden

### Schritt 3: MCP Server Status prüfen

**In Claude Desktop Chat:**
```
System-Status prüfen
```

**Erwartetes Verhalten:**
- AI-Agent nutzt `workflow/check_status` Tool
- Antwort enthält Status-Informationen
- Keine Fehlermeldungen

### Schritt 4: Weitere Tools testen

**Gleiche Tests wie bei Cursor (siehe oben)**

## Bekannte Probleme & Workarounds

### Problem: `${workspaceFolder}` wird nicht aufgelöst

**Symptom:**
- MCP Server startet nicht
- Fehlermeldung: "Workspace root does not exist"

**Lösung:**
- Verwenden Sie absoluten Pfad statt `${workspaceFolder}`
- Beispiel (Windows): `"D:/Datenbank für Noyrax/mcp-server/out/cli/server-cli.js"`

### Problem: Pfad mit Umlauten

**Symptom:**
- Encoding-Warnungen
- MCP Server startet möglicherweise nicht

**Lösung:**
- Funktioniert trotz Warnung (siehe `KNOWN_ISSUES.md`)
- Optional: Workspace-Pfad ohne Umlaute verwenden

### Problem: MCP Server startet nicht

**Symptom:**
- Keine Verbindung zu MCP Server
- Fehlermeldungen in Logs

**Lösung:**
1. Prüfen Sie ob MCP Server manuell startet:
   ```powershell
   node mcp-server/out/cli/server-cli.js .
   ```
2. Prüfen Sie ob beide Plugins kompiliert sind:
   ```powershell
   Test-Path 5d-database-plugin/out/api
   Test-Path documentation-system-plugin/out/cli
   ```
3. Prüfen Sie Logs in stderr

### Problem: Tools funktionieren nicht

**Symptom:**
- Tools geben Fehler zurück
- "5D Database Plugin is not available"

**Lösung:**
1. Prüfen Sie ob `docs/` existiert (für Database-Tools)
2. Prüfen Sie ob SQLite-DBs existieren (für Database-Tools)
3. Prüfen Sie System-Status: `workflow/check_status` Tool nutzen

## Verifikations-Checkliste

Nach der Konfiguration sollten alle folgenden Punkte erfüllt sein:

- [ ] Konfigurations-Datei existiert (`.cursor/mcp-config.json` oder `.vscode/settings.json` oder `claude_desktop_config.json`)
- [ ] Konfigurations-Datei hat korrekten Inhalt (JSON ist valide)
- [ ] MCP Server startet manuell: `node mcp-server/out/cli/server-cli.js .`
- [ ] AI-Agent kann `workflow/check_status` Tool aufrufen
- [ ] AI-Agent kann `system_explanation` Tool aufrufen
- [ ] AI-Agent kann `bootstrap` Tool aufrufen
- [ ] Keine Fehlermeldungen in Logs
- [ ] Tools geben erwartete Antworten zurück

## Nächste Schritte

Nach erfolgreicher Verifikation:
1. ✅ Konfiguration dokumentiert
2. ⏭️ Production-Ready Checkliste abarbeiten (siehe `NEXT_STEPS.md`)
3. ⏭️ Integration-Tests ausführen (siehe `src/__tests__/integration.test.ts`)

