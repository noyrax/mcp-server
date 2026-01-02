#!/usr/bin/env node

/**
 * Manuelles Test-Script für Unified MCP Server
 * Prüft alle Komponenten ohne MCP-Protokoll
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

console.log('=== Unified MCP Server - Manuelle Tests ===\n');
console.log(`Workspace Root: ${workspaceRoot}\n`);

// Test 1: Workspace-Resolver
console.log('Test 1: Workspace-Resolver');
try {
    const { WorkspaceResolver } = await import('./out/workspace-resolver.js');
    const resolved = WorkspaceResolver.resolveWorkspaceRoot(workspaceRoot);
    console.log(`✅ Workspace-Root erkannt: ${resolved}`);
    
    const docsPath = WorkspaceResolver.findDocsDirectory(workspaceRoot);
    if (docsPath) {
        console.log(`✅ docs/ Verzeichnis gefunden: ${docsPath}`);
    } else {
        console.log(`⚠️  docs/ Verzeichnis nicht gefunden`);
    }
} catch (error) {
    console.log(`❌ Fehler: ${error.message}`);
}
console.log('');

// Test 2: Database Plugin Adapter
console.log('Test 2: Database Plugin Adapter');
try {
    const { DatabasePluginAdapter } = await import('./out/plugins/database-plugin-adapter.js');
    const adapter = new DatabasePluginAdapter(workspaceRoot);
    
    console.log(`✅ Adapter erstellt`);
    console.log(`   Plugin verfügbar: ${adapter.isAvailable()}`);
    
    const pluginPath = adapter.getPluginPath();
    if (pluginPath) {
        console.log(`   Plugin-Pfad: ${pluginPath}`);
    } else {
        console.log(`   ⚠️  Plugin-Pfad nicht gefunden`);
    }
} catch (error) {
    console.log(`❌ Fehler: ${error.message}`);
    if (error.stack) {
        console.log(`   Stack: ${error.stack.split('\n')[1]}`);
    }
}
console.log('');

// Test 3: Documentation Plugin Adapter
console.log('Test 3: Documentation Plugin Adapter');
try {
    const { DocumentationPluginAdapter } = await import('./out/plugins/documentation-plugin-adapter.js');
    const adapter = new DocumentationPluginAdapter(workspaceRoot);
    
    console.log(`✅ Adapter erstellt`);
    console.log(`   Plugin verfügbar: ${adapter.isAvailable()}`);
    
    const pluginPath = adapter.getPluginPath();
    if (pluginPath) {
        console.log(`   Plugin-Pfad: ${pluginPath}`);
    } else {
        console.log(`   ⚠️  Plugin-Pfad nicht gefunden`);
    }
} catch (error) {
    console.log(`❌ Fehler: ${error.message}`);
    if (error.stack) {
        console.log(`   Stack: ${error.stack.split('\n')[1]}`);
    }
}
console.log('');

// Test 4: Server-Initialisierung
console.log('Test 4: Server-Initialisierung');
try {
    const { UnifiedMcpServer } = await import('./out/server.js');
    const server = new UnifiedMcpServer(workspaceRoot);
    
    console.log(`✅ Server-Instanz erstellt`);
    
    // Prüfe ob Server initialisiert werden kann (ohne start())
    console.log(`   Server-Objekt: ${server.constructor.name}`);
} catch (error) {
    console.log(`❌ Fehler: ${error.message}`);
    if (error.stack) {
        console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
    }
}
console.log('');

// Test 5: Datei-Existenz-Prüfungen
console.log('Test 5: Datei-Existenz-Prüfungen');
const requiredFiles = [
    'out/server.js',
    'out/workspace-resolver.js',
    'out/plugins/database-plugin-adapter.js',
    'out/plugins/documentation-plugin-adapter.js',
    'out/tools/database-tools.js',
    'out/tools/validation-tools.js',
    'out/tools/orchestration-tools.js',
    'out/cli/server-cli.js'
];

for (const file of requiredFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - FEHLT`);
    }
}
console.log('');

// Test 6: Plugin-Dateien prüfen
console.log('Test 6: Plugin-Dateien prüfen');
const dbPluginPath = path.join(workspaceRoot, '5d-database-plugin');
const docPluginPath = path.join(workspaceRoot, 'documentation-system-plugin');

if (fs.existsSync(dbPluginPath)) {
    console.log(`✅ 5D Database Plugin gefunden: ${dbPluginPath}`);
    const apiPath = path.join(dbPluginPath, 'out', 'api');
    if (fs.existsSync(apiPath)) {
        console.log(`   ✅ API-Verzeichnis vorhanden`);
    } else {
        console.log(`   ⚠️  API-Verzeichnis fehlt (Plugin muss kompiliert sein)`);
    }
} else {
    console.log(`❌ 5D Database Plugin nicht gefunden`);
}

if (fs.existsSync(docPluginPath)) {
    console.log(`✅ Documentation System Plugin gefunden: ${docPluginPath}`);
    const cliPath = path.join(docPluginPath, 'out', 'cli');
    if (fs.existsSync(cliPath)) {
        console.log(`   ✅ CLI-Verzeichnis vorhanden`);
    } else {
        console.log(`   ⚠️  CLI-Verzeichnis fehlt (Plugin muss kompiliert sein)`);
    }
} else {
    console.log(`❌ Documentation System Plugin nicht gefunden`);
}
console.log('');

console.log('=== Tests abgeschlossen ===');

