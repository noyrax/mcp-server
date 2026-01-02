import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves workspace root from various sources:
 * - Multi-root workspaces
 * - VS Code workspace files (.code-workspace)
 * - Cursor workspace configuration
 * - Current working directory (fallback)
 */
export class WorkspaceResolver {
    /**
     * Resolves workspace root from command line argument or environment.
     * Supports:
     * - Single workspace root (directory path)
     * - Multi-root workspace (.code-workspace file)
     * - Current working directory (fallback)
     */
    public static resolveWorkspaceRoot(workspaceArg?: string): string {
        // If workspace argument is provided, use it
        if (workspaceArg) {
            const resolved = path.resolve(workspaceArg);
            if (fs.existsSync(resolved)) {
                // Check if it's a workspace file
                if (resolved.endsWith('.code-workspace')) {
                    return this.resolveFromWorkspaceFile(resolved);
                }
                return resolved;
            }
        }

        // Try to find workspace file in current directory
        const workspaceFile = this.findWorkspaceFile(process.cwd());
        if (workspaceFile) {
            return this.resolveFromWorkspaceFile(workspaceFile);
        }

        // Fallback to current working directory
        return process.cwd();
    }

    /**
     * Resolves workspace root from VS Code workspace file.
     * Returns the first folder path from the workspace file.
     */
    private static resolveFromWorkspaceFile(workspaceFile: string): string {
        try {
            const content = fs.readFileSync(workspaceFile, 'utf-8');
            const workspace = JSON.parse(content);

            if (workspace.folders && workspace.folders.length > 0) {
                // Get first folder (deterministic)
                const firstFolder = workspace.folders[0];
                if (firstFolder.path) {
                    const workspaceDir = path.dirname(workspaceFile);
                    const folderPath = path.resolve(workspaceDir, firstFolder.path);
                    if (fs.existsSync(folderPath)) {
                        return folderPath;
                    }
                }
            }
        } catch (error) {
            // If parsing fails, fall back to workspace file directory
            return path.dirname(workspaceFile);
        }

        // Fallback to workspace file directory
        return path.dirname(workspaceFile);
    }

    /**
     * Finds workspace file (.code-workspace) in directory or parent directories.
     */
    private static findWorkspaceFile(startDir: string, maxDepth: number = 5): string | null {
        let currentDir = path.resolve(startDir);
        let depth = 0;

        while (depth < maxDepth) {
            const files = fs.readdirSync(currentDir, { withFileTypes: true });
            const workspaceFiles = files
                .filter((f) => f.isFile() && f.name.endsWith('.code-workspace'))
                // deterministisch: unabhängig von FS-Reihenfolge
                .sort((a, b) => a.name.localeCompare(b.name));
            if (workspaceFiles.length > 0) {
                return path.join(currentDir, workspaceFiles[0].name);
            }

            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break;
            }
            currentDir = parentDir;
            depth++;
        }

        return null;
    }

    /**
     * Finds docs directory in workspace root or parent directories.
     */
    public static findDocsDirectory(workspaceRoot: string, maxDepth: number = 5): string | null {
        const docsPath = path.join(workspaceRoot, 'docs');
        if (fs.existsSync(docsPath) && fs.statSync(docsPath).isDirectory()) {
            return docsPath;
        }

        // Search in parent directories
        let currentDir = path.resolve(workspaceRoot);
        let depth = 0;

        while (depth < maxDepth) {
            const parentDocsPath = path.join(currentDir, 'docs');
            if (fs.existsSync(parentDocsPath) && fs.statSync(parentDocsPath).isDirectory()) {
                return parentDocsPath;
            }

            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break;
            }
            currentDir = parentDir;
            depth++;
        }

        return null;
    }

    /**
     * Finds plugin directories relative to workspace root.
     */
    public static findPluginPaths(workspaceRoot: string): {
        databasePlugin?: string;
        documentationPlugin?: string;
    } {
        const result: {
            databasePlugin?: string;
            documentationPlugin?: string;
        } = {};

        // Check for 5d-database-plugin
        const dbPluginPath = path.join(workspaceRoot, '5d-database-plugin');
        if (fs.existsSync(dbPluginPath)) {
            result.databasePlugin = dbPluginPath;
        }

        // Check for documentation-system-plugin
        const docPluginPath = path.join(workspaceRoot, 'documentation-system-plugin');
        if (fs.existsSync(docPluginPath)) {
            result.documentationPlugin = docPluginPath;
        }

        return result;
    }
}

