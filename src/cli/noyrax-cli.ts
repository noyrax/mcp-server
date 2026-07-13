#!/usr/bin/env node
/**
 * Unified CLI for Noyrax export commands.
 * 
 * Usage:
 *   noyrax export:contract [--out <path>] [--json]
 *   noyrax export:import-map [--out <path>] [--json]
 *   noyrax export:status [--json]
 *   noyrax export:tools-manifest [--out <path>] [--json]
 */

import * as path from 'path';
import * as fs from 'fs';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'No command specified',
            usage: {
                'export:contract': 'Generate system contract',
                'export:import-map': 'Generate public import map',
                'export:status': 'Get system status',
                'export:tools-manifest': 'Generate tools manifest'
            }
        }, null, 2));
        process.exit(1);
    }
    
    const command = args[0];
    const workspaceRoot = process.cwd();
    const jsonOutput = args.includes('--json');
    
    if (command === 'export:contract') {
        // Delegate to export-contract-cli
        const exportContractPath = path.join(__dirname, 'export-contract-cli.js');
        if (!fs.existsSync(exportContractPath)) {
            console.error(JSON.stringify({
                status: 'error',
                error: 'export-contract-cli.js not found',
                path: exportContractPath
            }, null, 2));
            process.exit(1);
        }
        
        // Import and run
        const { main: exportContractMain } = await import('./export-contract-cli.js');
        const remainingArgs = args.slice(1).filter(a => a !== '--json');
        process.argv = ['node', 'export-contract-cli.js', workspaceRoot, ...remainingArgs];
        await exportContractMain();
    } else if (command === 'export:import-map') {
        // Delegate to export-import-map-cli
        const exportImportMapPath = path.join(__dirname, 'export-import-map-cli.js');
        if (!fs.existsSync(exportImportMapPath)) {
            console.error(JSON.stringify({
                status: 'error',
                error: 'export-import-map-cli.js not found',
                path: exportImportMapPath
            }, null, 2));
            process.exit(1);
        }
        
        // Import and run
        const { main: exportImportMapMain } = await import('./export-import-map-cli.js');
        const remainingArgs = args.slice(1).filter(a => a !== '--json');
        process.argv = ['node', 'export-import-map-cli.js', workspaceRoot, ...remainingArgs];
        await exportImportMapMain();
    } else if (command === 'export:status') {
        // Delegate to orchestration tools checkStatus
        const { OrchestrationTools } = await import('../tools/orchestration-tools.js');
        const { DatabaseTools } = await import('../tools/database-tools.js');
        const { ValidationTools } = await import('../tools/validation-tools.js');
        const { DatabasePluginAdapter } = await import('../plugins/database-plugin-adapter.js');
        const { DocumentationPluginAdapter } = await import('../plugins/documentation-plugin-adapter.js');
        const { WorkspaceResolver } = await import('../workspace-resolver.js');
        
        const pluginPaths = WorkspaceResolver.findPluginPaths(workspaceRoot);
        const databaseAdapter = new DatabasePluginAdapter(workspaceRoot, pluginPaths.databasePlugin);
        const documentationAdapter = new DocumentationPluginAdapter(workspaceRoot, pluginPaths.documentationPlugin);
        
        const databaseTools = new DatabaseTools(databaseAdapter);
        const validationTools = new ValidationTools(documentationAdapter);
        const orchestrationTools = new OrchestrationTools(databaseTools, validationTools, workspaceRoot);
        
        const status = await orchestrationTools.checkStatus();
        console.log(JSON.stringify(status, null, 2));
    } else if (command === 'export:snapshot') {
        // Delegate to export-snapshot-cli
        const exportSnapshotPath = path.join(__dirname, 'export-snapshot-cli.js');
        if (!fs.existsSync(exportSnapshotPath)) {
            console.error(JSON.stringify({
                status: 'error',
                error: 'export-snapshot-cli.js not found',
                path: exportSnapshotPath
            }, null, 2));
            process.exit(1);
        }
        
        // Import and run
        const { main: exportSnapshotMain } = await import('./export-snapshot-cli.js');
        const remainingArgs = args.slice(1).filter(a => a !== '--json');
        process.argv = ['node', 'export-snapshot-cli.js', workspaceRoot, ...remainingArgs];
        await exportSnapshotMain();
    } else if (command === 'import:snapshot') {
        // Delegate to import-snapshot-cli
        const importSnapshotPath = path.join(__dirname, 'import-snapshot-cli.js');
        if (!fs.existsSync(importSnapshotPath)) {
            console.error(JSON.stringify({
                status: 'error',
                error: 'import-snapshot-cli.js not found',
                path: importSnapshotPath
            }, null, 2));
            process.exit(1);
        }
        
        // Import and run
        const { main: importSnapshotMain } = await import('./import-snapshot-cli.js');
        const remainingArgs = args.slice(1).filter(a => a !== '--json');
        process.argv = ['node', 'import-snapshot-cli.js', workspaceRoot, ...remainingArgs];
        await importSnapshotMain();
    } else if (command === 'export:tools-manifest') {
        // Generate tools manifest from contract
        const { SystemContractGenerator } = await import('../tools/system-contract-generator.js');
        const { ToolsManifestGenerator } = await import('../tools/tools-manifest-generator.js');
        const { OrchestrationTools } = await import('../tools/orchestration-tools.js');
        const { DatabaseTools } = await import('../tools/database-tools.js');
        const { ValidationTools } = await import('../tools/validation-tools.js');
        const { DatabasePluginAdapter } = await import('../plugins/database-plugin-adapter.js');
        const { DocumentationPluginAdapter } = await import('../plugins/documentation-plugin-adapter.js');
        const { WorkspaceResolver } = await import('../workspace-resolver.js');
        
        const pluginPaths = WorkspaceResolver.findPluginPaths(workspaceRoot);
        const databaseAdapter = new DatabasePluginAdapter(workspaceRoot, pluginPaths.databasePlugin);
        const documentationAdapter = new DocumentationPluginAdapter(workspaceRoot, pluginPaths.documentationPlugin);
        
        const databaseTools = new DatabaseTools(databaseAdapter);
        const validationTools = new ValidationTools(documentationAdapter);
        const orchestrationTools = new OrchestrationTools(databaseTools, validationTools, workspaceRoot);
        
        const contractGenerator = new SystemContractGenerator(workspaceRoot, orchestrationTools);
        const contract = await contractGenerator.generate();
        
        const manifestGenerator = new ToolsManifestGenerator();
        const outputPath = args.includes('--out') && args[args.indexOf('--out') + 1]
            ? args[args.indexOf('--out') + 1]
            : path.join(workspaceRoot, 'tools_manifest.json');
        
        manifestGenerator.write(contract, outputPath);
        console.log(JSON.stringify({
            status: 'success',
            output_path: outputPath,
            message: 'Tools manifest generated successfully'
        }, null, 2));
    } else {
        console.error(JSON.stringify({
            status: 'error',
            error: `Unknown command: ${command}`,
            usage: {
                'export:contract': 'Generate system contract',
                'export:import-map': 'Generate public import map',
                'export:status': 'Get system status',
                'export:tools-manifest': 'Generate tools manifest'
            }
        }, null, 2));
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(JSON.stringify({
            status: 'error',
            error: error?.message || String(error),
            message: 'Unexpected error'
        }, null, 2));
        process.exit(1);
    });
}

export { main };

