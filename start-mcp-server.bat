@echo off
REM Batch Wrapper für Unified MCP Server
REM Löst Encoding-Probleme mit Umlauten im Pfad
REM WICHTIG: Keine Ausgabe außer Node.js-Server (kein Banner)

REM UTF-8 Encoding setzen (unterdrückt Ausgabe)
chcp 65001 >nul 2>&1

REM In Workspace-Root wechseln (absoluter Pfad)
cd /d "D:\Datenbank fuer Noyrax"

REM Node.js direkt aufrufen - stdout bleibt für JSON-RPC
REM Stderr wird nicht umgeleitet, damit Fehler sichtbar bleiben
node "mcp-server\out\cli\server-cli.js" "D:\Datenbank fuer Noyrax"
