#!/usr/bin/env node
/**
 * CLI Tool for exporting public import map.
 * 
 * Usage:
 *   node export-import-map-cli.js <workspace-root> [--out <output-path>]
 */

import * as path from 'path';
import { ImportMapGenerator } from '../tools/import-map-generator.js';

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
        outputPath = path.join(workspaceRoot, 'public_import_map.json');
    }
    
    // Resolve workspace root
    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    
    // Generate import map
    const generator = new ImportMapGenerator(resolvedWorkspaceRoot);
    
    try {
        generator.write(outputPath);
        console.log(JSON.stringify({
            status: 'success',
            output_path: outputPath,
            message: 'Public import map generated successfully'
        }, null, 2));
    } catch (error: any) {
        console.error(JSON.stringify({
            status: 'error',
            error: error?.message || String(error),
            message: 'Failed to generate public import map'
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

