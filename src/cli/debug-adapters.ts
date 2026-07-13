#!/usr/bin/env node
/**
 * Debug tool to check adapter availability.
 * Usage: node out/cli/debug-adapters.js <workspace-root>
 */

import { UnifiedMcpServer } from '../server.js';
import * as path from 'path';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const workspaceRoot = args[0] || process.cwd();

    console.log('=== MCP Server Adapter Debug Info ===\n');
    console.log(`Workspace Root: ${workspaceRoot}\n`);

    try {
        const server = new UnifiedMcpServer(workspaceRoot);
        
        // Get adapter info using reflection (access private members for debugging)
        const dbAdapter = (server as any).databaseAdapter;
        const docAdapter = (server as any).documentationAdapter;

        console.log('=== Database Plugin Adapter ===');
        if (dbAdapter) {
            const dbInfo = dbAdapter.getAvailabilityInfo ? dbAdapter.getAvailabilityInfo() : {
                pluginPath: dbAdapter.getPluginPath ? dbAdapter.getPluginPath() : 'unknown',
                exists: false,
                hasOutApi: false,
                hasOutCore: false,
                hasPackageJson: false,
                resolvedFrom: 'unknown'
            };
            console.log(JSON.stringify(dbInfo, null, 2));
            console.log(`Available: ${dbAdapter.isAvailable()}`);
        } else {
            console.log('Adapter not initialized');
        }

        console.log('\n=== Documentation Plugin Adapter ===');
        if (docAdapter) {
            const docInfo = docAdapter.getAvailabilityInfo ? docAdapter.getAvailabilityInfo() : {
                pluginPath: docAdapter.getPluginPath ? docAdapter.getPluginPath() : 'unknown',
                exists: false,
                hasOutCli: false,
                hasPackageJson: false,
                hasCliScripts: false,
                resolvedFrom: 'unknown'
            };
            console.log(JSON.stringify(docInfo, null, 2));
            console.log(`Available: ${docAdapter.isAvailable()}`);
        } else {
            console.log('Adapter not initialized');
        }

        console.log('\n=== Tool Registration Status ===');
        // Try to get tools list (this requires the server to be started, so we'll just check adapters)
        console.log(`Database Tools: ${dbAdapter?.isAvailable() ? 'Will be registered' : 'Will NOT be registered'}`);
        console.log(`Validation Tools: ${docAdapter?.isAvailable() ? 'Will be registered' : 'Will NOT be registered'}`);
        console.log(`Orchestration Tools: Always registered`);

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});


