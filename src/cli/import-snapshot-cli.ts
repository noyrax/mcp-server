#!/usr/bin/env node
/**
 * CLI Tool for importing system snapshot.
 * 
 * Usage:
 *   node import-snapshot-cli.js <workspace-root> <snapshot-path> [--delta]
 */

import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceResolver } from '../workspace-resolver.js';
import { DatabasePluginAdapter } from '../plugins/database-plugin-adapter.js';
import { DocumentationPluginAdapter } from '../plugins/documentation-plugin-adapter.js';
import { DatabaseTools } from '../tools/database-tools.js';
import { ValidationTools } from '../tools/validation-tools.js';
import { OrchestrationTools } from '../tools/orchestration-tools.js';
import { SnapshotImporter } from '../tools/snapshot-importer.js';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Parse arguments
    let workspaceRoot: string | undefined;
    let snapshotPath: string | undefined;
    let delta = false;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--delta') {
            delta = true;
        } else if (!workspaceRoot && !args[i].startsWith('--')) {
            workspaceRoot = args[i];
        } else if (!snapshotPath && !args[i].startsWith('--') && args[i] !== workspaceRoot) {
            snapshotPath = args[i];
        }
    }
    
    // Default workspace root
    if (!workspaceRoot) {
        workspaceRoot = process.cwd();
    }
    
    // Snapshot path is required
    if (!snapshotPath) {
        console.error(JSON.stringify({
            status: 'error',
            error: 'Snapshot path is required',
            usage: 'node import-snapshot-cli.js <workspace-root> <snapshot-path> [--delta]'
        }, null, 2));
        process.exit(1);
    }
    
    // Resolve paths
    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedSnapshotPath = path.resolve(snapshotPath);
    
    if (!fs.existsSync(resolvedSnapshotPath)) {
        console.error(JSON.stringify({
            status: 'error',
            error: `Snapshot file not found: ${resolvedSnapshotPath}`
        }, null, 2));
        process.exit(1);
    }
    
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
    
    // Import snapshot
    const importer = new SnapshotImporter(resolvedWorkspaceRoot, orchestrationTools);
    
    try {
        const result = await importer.import(resolvedSnapshotPath, delta);
        console.log(JSON.stringify({
            status: result.status,
            imported_dimensions: result.imported_dimensions,
            skipped_dimensions: result.skipped_dimensions,
            checksum_validation: result.checksum_validation,
            errors: result.errors,
            message: 'Snapshot imported successfully'
        }, null, 2));
        
        if (result.status === 'error') {
            process.exit(1);
        }
    } catch (error: any) {
        console.error(JSON.stringify({
            status: 'error',
            error: error?.message || String(error),
            message: 'Failed to import snapshot'
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

