#!/usr/bin/env node
/**
 * CLI Tool for exporting system contract.
 * 
 * Usage:
 *   node export-contract-cli.js <workspace-root> [--out <output-path>]
 */

import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceResolver } from '../workspace-resolver.js';
import { DatabasePluginAdapter } from '../plugins/database-plugin-adapter.js';
import { DocumentationPluginAdapter } from '../plugins/documentation-plugin-adapter.js';
import { DatabaseTools } from '../tools/database-tools.js';
import { ValidationTools } from '../tools/validation-tools.js';
import { OrchestrationTools } from '../tools/orchestration-tools.js';
import { SystemContractGenerator } from '../tools/system-contract-generator.js';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Parse arguments
    let workspaceRoot: string | undefined;
    let outputPath: string | undefined;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--out' && args[i + 1]) {
            outputPath = args[i + 1];
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
        outputPath = path.join(workspaceRoot, 'system_contract.json');
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
            // Continue even if initialization fails (contract generation should still work)
            console.error(`Warning: Database tools initialization failed: ${error}`);
        }
    }
    
    // Generate contract
    const generator = new SystemContractGenerator(resolvedWorkspaceRoot, orchestrationTools);
    
    try {
        await generator.write(outputPath);
        console.log(JSON.stringify({
            status: 'success',
            output_path: outputPath,
            message: 'System contract generated successfully'
        }, null, 2));
    } catch (error: any) {
        console.error(JSON.stringify({
            status: 'error',
            error: error?.message || String(error),
            message: 'Failed to generate system contract'
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

