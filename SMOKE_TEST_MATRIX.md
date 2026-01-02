# Smoke-Test-Matrix für MCP-Server

**Datum:** 2025-12-29  
**Zweck:** Definiert die Test-Matrix für Smoke-Tests des Unified MCP Servers

## Test-Matrix

### Workspace-Root Varianten

| Variante | Beschreibung | Erwartetes Verhalten |
|----------|--------------|---------------------|
| **Normaler Ordner** | Standard-Workspace-Root (z.B. `D:\Datenbank für Noyrax`) | Server startet, Tools verfügbar |
| **Multi-Root Workspace** | VS Code `.code-workspace` Datei | Server nutzt ersten Folder als Root |
| **Pfad mit Umlauten** | Workspace-Pfad enthält Umlaute (z.B. "für") | Server startet trotz Encoding-Warnung |
| **Nicht existierender Pfad** | Workspace-Root existiert nicht | Server gibt Fehler aus, beendet mit Exit-Code 1 |

### System-Zustände

| Zustand | docs/ | .database-plugin/ | Erwartetes Verhalten |
|---------|-------|-------------------|---------------------|
| **Vollständig** | ✅ vorhanden | ✅ vorhanden | Alle Tools verfügbar, `workflow/check_status` zeigt "ok" |
| **Keine Docs** | ❌ fehlt | ✅ vorhanden | Server startet, aber Tools geben Fehler bei docs/-
abhängigen Operationen |
| **Keine DBs** | ✅ vorhanden | ❌ fehlt | Server startet, aber Tools geben Fehler bei DB-abhängigen Operationen |
| **Nichts vorhanden** | ❌ fehlt | ❌ fehlt | Server startet, aber fast alle Tools geben Fehler |

## Test-Szenarien

### Szenario 1: Happy Path (Vollständiges Setup)

**Voraussetzungen:**
- Workspace-Root: Normaler Ordner
- docs/: vorhanden
- .database-plugin/: vorhanden

**Erwartetes Verhalten:**
- ✅ Server startet ohne Fehler
- ✅ `tools/list` gibt alle Tools zurück
- ✅ `workflow/check_status` zeigt Status "ok" für alle Komponenten
- ✅ `bootstrap` gibt gültige JSON zurück
- ✅ `system_explanation` gibt gültige JSON zurück

### Szenario 2: Fehlende Dokumentation

**Voraussetzungen:**
- Workspace-Root: Normaler Ordner
- docs/: fehlt
- .database-plugin/: vorhanden (aber möglicherweise veraltet)

**Erwartetes Verhalten:**
- ✅ Server startet ohne Fehler
- ✅ `tools/list` gibt alle Tools zurück
- ✅ `workflow/check_status` zeigt Status "error" für docs/
- ✅ `bootstrap` gibt Fehler zurück (oder Warnung)
- ✅ Tools, die docs/ benötigen, geben Fehler zurück

### Szenario 3: Fehlende Datenbanken

**Voraussetzungen:**
- Workspace-Root: Normaler Ordner
- docs/: vorhanden
- .database-plugin/: fehlt

**Erwartetes Verhalten:**
- ✅ Server startet ohne Fehler
- ✅ `tools/list` gibt alle Tools zurück
- ✅ `workflow/check_status` zeigt Status "error" für .database-plugin/
- ✅ Database-Tools geben Fehler zurück (Plugin nicht verfügbar)
- ✅ Validation-Tools funktionieren (nutzen docs/ direkt)

### Szenario 4: Multi-Root Workspace

**Voraussetzungen:**
- Workspace-Root: `.code-workspace` Datei
- Erster Folder hat docs/ und .database-plugin/

**Erwartetes Verhalten:**
- ✅ Server startet ohne Fehler
- ✅ Workspace-Resolver nutzt ersten Folder
- ✅ Tools funktionieren wie in Szenario 1

### Szenario 5: Pfad mit Umlauten (Windows)

**Voraussetzungen:**
- Workspace-Root: Pfad mit Umlauten (z.B. "D:\Datenbank für Noyrax")
- docs/: vorhanden
- .database-plugin/: vorhanden

**Erwartetes Verhalten:**
- ✅ Server startet ohne Fehler (mögliche Encoding-Warnung)
- ✅ Tools funktionieren trotz Encoding-Warnung
- ✅ Pfade werden korrekt aufgelöst

## Kern-Tools für Verifikation

### Database Tools
- `bootstrap` - First-Contact für Agenten
- `system_explanation` - System-Übersicht
- `workflow/check_status` - System-Status prüfen

### Validation Tools
- `validation/runScan` - Dokumentations-Scan (benötigt docs/)

### Orchestration Tools
- `workflow/check_status` - System-Status prüfen (kern)

## Test-Implementierung

Die Tests sollten:
1. **Deterministisch** sein - gleiche Eingabe → gleiche Ausgabe
2. **Isoliert** sein - keine Abhängigkeiten zwischen Tests
3. **Schnell** sein - Smoke-Tests sollten < 30 Sekunden dauern
4. **Aussagekräftig** sein - klare Fehlermeldungen bei Fehlern

## Bekannte Einschränkungen

- **ChromaDB DefaultEmbeddingFunction Warnung** - Kann ignoriert werden
- **SQLite VSS auf Windows** - ChromaDB-Fallback funktioniert
- **Path-Encoding mit Umlauten** - Funktioniert trotz Warnung

## Nächste Schritte

1. ✅ Smoke-Test-Matrix definiert
2. ⏭️ Integration-Tests implementieren (siehe `src/__tests__/integration.test.ts`)
3. ⏭️ Automatisierte Test-Runs in CI/CD

