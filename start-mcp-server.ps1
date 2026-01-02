# PowerShell Wrapper für Unified MCP Server
# Löst Encoding-Probleme mit Umlauten im Pfad
# WICHTIG: Keine Banner-Ausgabe, nur JSON-RPC über stdout

# Alle Ausgaben außer Node.js-Server unterdrücken
$ErrorActionPreference = "SilentlyContinue"
$ProgressPreference = "SilentlyContinue"

# Workspace-Root (absoluter Pfad)
$workspaceRoot = "D:\Datenbank für Noyrax"
$serverPath = Join-Path $workspaceRoot "mcp-server\out\cli\server-cli.js"

# Prüfen ob Server existiert (stderr, nicht stdout)
if (-not (Test-Path $serverPath)) {
    [Console]::Error.WriteLine("Server not found: $serverPath")
    exit 1
}

# In Workspace-Root wechseln
Set-Location $workspaceRoot | Out-Null

# Server starten mit korrektem Encoding
$env:NODE_ENV = "production"
$env:NOYRAX_MCP_DEBUG = "1"

# Node.js direkt aufrufen - stdout bleibt für JSON-RPC
# Stderr wird nicht umgeleitet, damit Fehler sichtbar bleiben
& node $serverPath $workspaceRoot
