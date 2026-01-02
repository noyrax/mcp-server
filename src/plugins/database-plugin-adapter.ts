import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

/**
 * Adapter for 5D Database Plugin APIs.
 * Provides access to database functionality without direct imports.
 */
export class DatabasePluginAdapter {
    private workspaceRoot: string;
    private pluginPath?: string;

    constructor(workspaceRoot: string, pluginPath?: string) {
        this.workspaceRoot = workspaceRoot;
        this.pluginPath = pluginPath || this.findPluginPath();
    }

    /**
     * Finds 5D Database Plugin path.
     */
    private findPluginPath(): string | undefined {
        // Allow explicit override (useful in foreign systems / non-standard layouts)
        const envOverrides = [
            process.env.NOYRAX_5D_DATABASE_PLUGIN_PATH,
            process.env.NOYRAX_DATABASE_PLUGIN_PATH
        ]
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter((v) => v.length > 0);

        for (const candidate of envOverrides) {
            const resolved = path.resolve(candidate);
            if (fs.existsSync(resolved) && fs.existsSync(path.join(resolved, 'package.json'))) {
                return resolved;
            }
        }

        const findInNodeModulesUpwards = (startDir: string, maxDepth: number = 6): string | undefined => {
            let currentDir = path.resolve(startDir);
            for (let depth = 0; depth <= maxDepth; depth++) {
                const scoped = path.join(currentDir, 'node_modules', '@noyrax', '5d-database-plugin');
                if (fs.existsSync(scoped) && fs.existsSync(path.join(scoped, 'package.json'))) {
                    return scoped;
                }
                const parent = path.dirname(currentDir);
                if (parent === currentDir) {
                    break;
                }
                currentDir = parent;
            }
            return undefined;
        };

        const possiblePaths = [
            path.join(this.workspaceRoot, '5d-database-plugin'),
            path.join(this.workspaceRoot, '..', '5d-database-plugin'),
            path.join(process.cwd(), '5d-database-plugin')
        ];

        for (const pluginPath of possiblePaths) {
            if (fs.existsSync(pluginPath) && fs.existsSync(path.join(pluginPath, 'package.json'))) {
                return pluginPath;
            }
        }

        // Fallback 1: resolve from workspace node_modules
        const workspaceNodeModules = findInNodeModulesUpwards(this.workspaceRoot);
        if (workspaceNodeModules) {
            return workspaceNodeModules;
        }

        // Fallback 2: resolve from node_modules (when installed as dependency of @noyrax/mcp-server)
        try {
            const require = createRequire(import.meta.url);
            // Try resolving relative to workspace root first (if installed in project)
            try {
                const pkgJsonPath = require.resolve('@noyrax/5d-database-plugin/package.json', {
                    paths: [this.workspaceRoot, process.cwd()]
                });
                return path.dirname(pkgJsonPath);
            } catch {
                // Ignore and try default resolution
            }
            
            // Try default resolution (relative to this file)
            const pkgJsonPath = require.resolve('@noyrax/5d-database-plugin/package.json');
            return path.dirname(pkgJsonPath);
        } catch {
            // ignore
        }

        return undefined;
    }

    /**
     * Checks if 5D Database Plugin is available.
     */
    public isAvailable(): boolean {
        if (!this.pluginPath) {
            return false;
        }
        
        // Check if out/api exists (compiled)
        const apiPath = path.join(this.pluginPath, 'out', 'api');
        if (fs.existsSync(apiPath)) {
            return true;
        }
        
        // Check if out/core/multi-db-manager.js exists (alternative path)
        const corePath = path.join(this.pluginPath, 'out', 'core', 'multi-db-manager.js');
        if (fs.existsSync(corePath)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Gets detailed availability information for debugging.
     */
    public getAvailabilityInfo(): {
        pluginPath: string | undefined;
        exists: boolean;
        hasOutApi: boolean;
        hasOutCore: boolean;
        hasPackageJson: boolean;
        resolvedFrom: string;
    } {
        const info = {
            pluginPath: this.pluginPath,
            exists: this.pluginPath !== undefined && fs.existsSync(this.pluginPath || ''),
            hasOutApi: false,
            hasOutCore: false,
            hasPackageJson: false,
            resolvedFrom: 'unknown'
        };
        
        if (this.pluginPath) {
            info.hasOutApi = fs.existsSync(path.join(this.pluginPath, 'out', 'api'));
            info.hasOutCore = fs.existsSync(path.join(this.pluginPath, 'out', 'core', 'multi-db-manager.js'));
            info.hasPackageJson = fs.existsSync(path.join(this.pluginPath, 'package.json'));
            
            // Determine where it was resolved from
            if (this.pluginPath.includes('node_modules')) {
                info.resolvedFrom = 'node_modules';
            } else if (this.pluginPath.includes(this.workspaceRoot)) {
                info.resolvedFrom = 'workspace';
            } else {
                info.resolvedFrom = 'other';
            }
        }
        
        return info;
    }

    /**
     * Gets the plugin path.
     */
    public getPluginPath(): string | undefined {
        return this.pluginPath;
    }

    /**
     * Dynamically imports and returns MultiDbManager.
     * Uses dynamic import to avoid hard dependencies.
     */
    public async getMultiDbManager(): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('5D Database Plugin not found');
        }

        const apiPath = path.join(this.pluginPath, 'out', 'api', 'index.js');
        if (!fs.existsSync(apiPath)) {
            // Try alternative path
            const altPath = path.join(this.pluginPath, 'out', 'core', 'multi-db-manager.js');
            if (fs.existsSync(altPath)) {
                const module = await import(pathToFileURL(altPath).href);
                return module.MultiDbManager;
            }
            throw new Error(`5D Database Plugin API not found at ${apiPath}`);
        }

        const module = await import(pathToFileURL(apiPath).href);
        return module.MultiDbManager;
    }

    /**
     * Creates a MultiDbManager instance.
     */
    public async createMultiDbManager(): Promise<any> {
        const MultiDbManager = await this.getMultiDbManager();
        return new MultiDbManager(this.workspaceRoot);
    }

    /**
     * Gets the database plugin workspace root.
     */
    public getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }
}

