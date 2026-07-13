#!/usr/bin/env node
/**
 * CLI Tool for exporting system snapshot.
 * 
 * Usage:
 *   node export-snapshot-cli.js <workspace-root> [--out <output-path>] [--delta] [--last-snapshot-hash <hash>]
 */

import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceResolver } from '../workspace-resolver.js';
import { DatabasePluginAdapter } from '../plugins/database-plugin-adapter.js';
import { DocumentationPluginAdapter } from '../plugins/documentation-plugin-adapter.js';
import { DatabaseTools } from '../tools/database-tools.js';
import { ValidationTools } from '../tools/validation-tools.js';
import { OrchestrationTools } from '../tools/orchestration-tools.js';
import { SnapshotExporter } from '../tools/snapshot-exporter.js';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Parse arguments
    let workspaceRoot: string | undefined;
    let outputPath: string | undefined;
    let delta = false;
    let lastSnapshotHash: string | undefined;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--out' && args[i + 1]) {
            outputPath = args[i + 1];
            i++;
        } else if (args[i] === '--delta') {
            delta = true;
        } else if (args[i] === '--last-snapshot-hash' && args[i + 1]) {
            lastSnapshotHash = args[i + 1];
            i++;
        } else if (!workspaceRoot && !args[i].startsWith('--')) {
            workspaceRoot = args[i];
        }
    }
    
    // Default workspace root
    if (!workspaceRoot) {
        workspaceRoot = process.cwd();
    }
    
    // Default output path
    if (!outputPath) {
        const snapshotType = delta ? 'delta' : 'full';
        outputPath = path.join(workspaceRoot, `snapshot_${snapshotType}_${Date.now()}.json`);
    }
    
    // Resolve workspace root
    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    
    // Initialize adapters
    const pluginPaths = WorkspaceResolver.findPluginPaths(resolvedWorkspaceRoot);
    const databaseAdapter = new DatabasePluginAdapter(resolvedWorkspaceRoot, pluginPaths.databasePlugin);
    const documentationAdapter = new DocumentationPluginAdapter(resolvedWorkspaceRoot, pluginPaths.documentationPlugin);
    
    // Initialize tools
    const databaseTools = new DatabaseTools(databaseAdapter);
    const validationTools = new ValidationTools(documentationAdapter);
    const orchestrationTools = new OrchestrationTools(
        databaseTools,
        validationTools,
        resolvedWorkspaceRoot
    );
    
    // Initialize database tools if available
    if (databaseAdapter.isAvailable()) {
        try {
            await databaseTools.initialize();
        } catch (error) {
            console.error(`Warning: Database tools initialization failed: ${error}`);
        }
    }
    
    // Export snapshot
    const exporter = new SnapshotExporter(resolvedWorkspaceRoot, orchestrationTools);
    
    try {
        await exporter.export(outputPath, delta, lastSnapshotHash);
        console.log(JSON.stringify({
            status: 'success',
            output_path: outputPath,
            snapshot_type: delta ? 'delta' : 'full',
            message: 'Snapshot exported successfully'
        }, null, 2));
    } catch (error: any) {
        console.error(JSON.stringify({
            status: 'error',
            error: error?.message || String(error),
            message: 'Failed to export snapshot'
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

