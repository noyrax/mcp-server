#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { UnifiedMcpServer } from '../server.js';
import { WorkspaceResolver } from '../workspace-resolver.js';

/**
 * CLI entry point for Unified MCP Server.
 * Usage: node server-cli.js <workspace-root>
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);

    // If no argument provided, try to find workspace root automatically
    let workspaceRoot: string | undefined;
    if (args.length === 0) {
        // Try to find workspace root by going up from current directory
        let currentDir = process.cwd();
        const maxDepth = 5;

        for (let depth = 0; depth < maxDepth; depth++) {
            // Check if this looks like a workspace root (has both plugins or docs/)
            const hasDocs = fs.existsSync(path.join(currentDir, 'docs'));
            const hasDbPlugin = fs.existsSync(path.join(currentDir, '5d-database-plugin'));
            const hasDocPlugin = fs.existsSync(path.join(currentDir, 'documentation-system-plugin'));

            if (hasDocs || (hasDbPlugin && hasDocPlugin)) {
                workspaceRoot = currentDir;
                break;
            }

            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break;
            }
            currentDir = parentDir;
        }

        if (!workspaceRoot) {
            const usage = 'Usage: noyrax-mcp-server [workspace-root]\n' +
                         '\n' +
                         'Starts the Unified MCP Server for Noyrax Workspace.\n' +
                         'The server orchestrates both 5D Database Plugin and Documentation System Plugin.\n' +
                         '\n' +
                         'If workspace-root is not provided, the server will try to find it automatically\n' +
                         'by searching for docs/ or both plugins in the current directory and parent directories.\n' +
                         '\n' +
                         'Prerequisites:\n' +
                         '  - Both plugins should be available in the workspace\n' +
                         '  - Documentation System Plugin should have generated docs/ directory\n' +
                         '  - 5D Database Plugin should have ingested the documentation';
            process.stderr.write(usage + '\n');
            process.exit(1);
        }
    } else {
        workspaceRoot = WorkspaceResolver.resolveWorkspaceRoot(args[0]);
    }

    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        process.stderr.write(`ERROR: Workspace root does not exist: ${workspaceRoot}\n`);
        process.exit(1);
    }

    // Debug: Log startup info to stderr (visible in Cursor Output Channel)
    if (process.env.NOYRAX_MCP_DEBUG === '1') {
        process.stderr.write(`[NOYRAX-MCP] Starting server for workspace: ${workspaceRoot}\n`);
        process.stderr.write(`[NOYRAX-MCP] Node version: ${process.version}\n`);
        process.stderr.write(`[NOYRAX-MCP] Process cwd: ${process.cwd()}\n`);
    }

    try {
        // Create and start MCP server
        const server = new UnifiedMcpServer(workspaceRoot);
        await server.start();
        
        // Debug: Log successful startup
        if (process.env.NOYRAX_MCP_DEBUG === '1') {
            process.stderr.write(`[NOYRAX-MCP] Server started successfully\n`);
        }
        
        // Server runs indefinitely, communicating via stdin/stdout
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Fatal error starting MCP server: ${errorMsg}\n`);
        if (error instanceof Error && error.stack) {
            process.stderr.write(`Stack trace: ${error.stack}\n`);
        }
        process.exit(1);
    }
}

// Check if this is the main module (ESM way)
// Always run main for CLI scripts in ES modules
main().catch(error => {
    const errorMsg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Fatal error: ${errorMsg}\n`);
    if (error instanceof Error && error.stack) {
        process.stderr.write(`Stack trace: ${error.stack}\n`);
    }
    process.exit(1);
});

