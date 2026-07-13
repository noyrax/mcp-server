import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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
        agentPlugin?: string;
    } {
        const result: {
            databasePlugin?: string;
            documentationPlugin?: string;
            agentPlugin?: string;
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

        // Check for agent-5d-system
        const agentPluginPath = path.join(workspaceRoot, 'agent-5d-system');
        if (fs.existsSync(agentPluginPath)) {
            result.agentPlugin = agentPluginPath;
        }

        return result;
    }

    /**
     * Normalizes a path for plugin ID computation (lowercase on Windows).
     * Used for deterministic plugin ID generation.
     * 
     * @param filePath Path to normalize
     * @returns Normalized path (POSIX-style, lowercase on Windows)
     */
    public static normalizeForPluginId(filePath: string): string {
        // Resolve to absolute path
        const resolved = path.resolve(filePath);
        
        // Convert to POSIX-style (forward slashes)
        const posix = resolved.replace(/\\/g, '/');
        
        // On Windows, normalize case (to lowercase for case-insensitive comparison)
        // On Unix, preserve case
        if (process.platform === 'win32') {
            return posix.toLowerCase();
        }
        
        return posix;
    }

    /**
     * Normalizes a file path (case-preserving).
     * Used for file path storage and entity ID computation.
     * 
     * @param filePath Path to normalize
     * @returns Normalized path (POSIX-style, case-preserved)
     */
    public static normalizeFilePath(filePath: string): string {
        // Resolve to absolute path
        const resolved = path.resolve(filePath);
        
        // Convert to POSIX-style (forward slashes)
        // Case is preserved - NO toLowerCase()
        return resolved.replace(/\\/g, '/');
    }

    /**
     * Computes canonical plugin ID from workspace root.
     * Uses SHA256 hash of normalized workspace root path.
     * 
     * @param workspaceRoot Workspace root path
     * @returns Plugin ID (16 hex characters)
     */
    public static computePluginId(workspaceRoot: string): string {
        const normalized = this.normalizeForPluginId(workspaceRoot);
        const hash = crypto.createHash('sha256').update(normalized).digest('hex');
        return hash.substring(0, 16);
    }

    /**
     * Computes canonical workspace ID from workspace root.
     * Uses SHA256 hash of normalized workspace root path.
     * 
     * @param workspaceRoot Workspace root path
     * @returns Workspace ID (16 hex characters)
     */
    public static computeWorkspaceId(workspaceRoot: string): string {
        // For now, workspace ID is the same as plugin ID
        // In the future, this could be different (e.g., for multi-workspace scenarios)
        return this.computePluginId(workspaceRoot);
    }

    /**
     * Computes entity ID hash for a given entity.
     * Used for cross-system stable entity references.
     * 
     * @param entityType Type of entity (e.g., 'module', 'symbol', 'adr')
     * @param entityPath Path or identifier of the entity
     * @returns Entity ID hash (16 hex characters)
     */
    public static computeEntityId(entityType: string, entityPath: string): string {
        const normalizedPath = this.normalizeFilePath(entityPath);
        const combined = `${entityType}:${normalizedPath}`;
        const hash = crypto.createHash('sha256').update(combined).digest('hex');
        return hash.substring(0, 16);
    }

    /**
     * Maps entity ID from one workspace to another.
     * Used for snapshot portability across different workspace roots.
     * 
     * @param entityId Original entity ID
     * @param sourceWorkspaceRoot Source workspace root
     * @param targetWorkspaceRoot Target workspace root
     * @returns Mapped entity ID (if mapping is possible)
     */
    public static mapEntityId(
        entityId: string,
        sourceWorkspaceRoot: string,
        targetWorkspaceRoot: string
    ): string | null {
        // For now, entity IDs are workspace-relative
        // In a full implementation, this would use entity_id_mapping rules from the contract
        // For snapshot portability, we'd need to store the mapping in the snapshot
        // This is a placeholder for future implementation
        return entityId; // Return same ID if mapping not needed/possible
    }
}

