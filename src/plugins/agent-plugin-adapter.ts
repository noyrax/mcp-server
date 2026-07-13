import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { execSync } from 'child_process';

/**
 * Adapter for Agent-5D-System Plugin APIs.
 * Provides access to agent database functionality without direct imports.
 */
export class AgentPluginAdapter {
    private workspaceRoot: string;
    private pluginPath?: string;

    constructor(workspaceRoot: string, pluginPath?: string) {
        this.workspaceRoot = workspaceRoot;
        this.pluginPath = pluginPath || this.findPluginPath();
    }

    /**
     * Finds Agent-5D-System Plugin path.
     */
    private findPluginPath(): string | undefined {
        // Allow explicit override (useful in foreign systems / non-standard layouts)
        const envOverrides = [
            process.env.NOYRAX_AGENT_5D_SYSTEM_PATH,
            process.env.NOYRAX_AGENT_PLUGIN_PATH
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
                const scoped = path.join(currentDir, 'node_modules', '@noyrax', 'agent-5d-system');
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
            path.join(this.workspaceRoot, 'agent-5d-system'),
            path.join(this.workspaceRoot, '..', 'agent-5d-system'),
            path.join(process.cwd(), 'agent-5d-system')
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
                const pkgJsonPath = require.resolve('@noyrax/agent-5d-system/package.json', {
                    paths: [this.workspaceRoot, process.cwd()]
                });
                return path.dirname(pkgJsonPath);
            } catch {
                // Ignore and try default resolution
            }
            
            // Try default resolution (relative to this file)
            const pkgJsonPath = require.resolve('@noyrax/agent-5d-system/package.json');
            return path.dirname(pkgJsonPath);
        } catch {
            // ignore
        }

        // Fallback 3: Check global npm installation
        try {
            const globalNodeModules = execSync('npm root -g', { encoding: 'utf-8' }).trim();
            const globalPluginPath = path.join(globalNodeModules, '@noyrax', 'agent-5d-system');
            if (fs.existsSync(globalPluginPath) && fs.existsSync(path.join(globalPluginPath, 'package.json'))) {
                return globalPluginPath;
            }
        } catch {
            // ignore - npm root -g might fail or not be available
        }

        // Fallback 4: Common global npm paths (Windows and Unix)
        const commonGlobalPaths = [
            // Windows
            path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@noyrax', 'agent-5d-system'),
            // Unix/Mac
            path.join('/usr', 'local', 'lib', 'node_modules', '@noyrax', 'agent-5d-system'),
            path.join(process.env.HOME || '', '.npm-global', 'node_modules', '@noyrax', 'agent-5d-system'),
            path.join(process.env.HOME || '', '.nvm', 'versions', 'node', 'v*', 'lib', 'node_modules', '@noyrax', 'agent-5d-system')
        ];

        for (const globalPath of commonGlobalPaths) {
            if (fs.existsSync(globalPath) && fs.existsSync(path.join(globalPath, 'package.json'))) {
                return globalPath;
            }
        }

        return undefined;
    }

    /**
     * Checks if Agent-5D-System Plugin is available.
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
        
        // Check if out/core/agent-multi-db-manager.js exists (alternative path)
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
     * Dynamically imports and returns AgentMultiDbManager.
     * Uses dynamic import to avoid hard dependencies.
     */
    public async getAgentMultiDbManager(): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Agent-5D-System Plugin not found');
        }

        const apiPath = path.join(this.pluginPath, 'out', 'api', 'index.js');
        if (!fs.existsSync(apiPath)) {
            // Try alternative path
            const altPath = path.join(this.pluginPath, 'out', 'core', 'multi-db-manager.js');
            if (fs.existsSync(altPath)) {
                const module = await import(pathToFileURL(altPath).href);
                return module.AgentMultiDbManager;
            }
            throw new Error(`Agent-5D-System Plugin API not found at ${apiPath}`);
        }

        // Try to import AgentMultiDbManager from the compiled output
        const module = await import(pathToFileURL(apiPath).href);
        // Check if AgentMultiDbManager is exported directly or from core
        if (module.AgentMultiDbManager) {
            return module.AgentMultiDbManager;
        }
        
        // Fallback: try core path
        const corePath = path.join(this.pluginPath, 'out', 'core', 'multi-db-manager.js');
        if (fs.existsSync(corePath)) {
            const coreModule = await import(pathToFileURL(corePath).href);
            return coreModule.AgentMultiDbManager;
        }
        
        throw new Error(`AgentMultiDbManager not found in Agent-5D-System Plugin`);
    }

    /**
     * Creates an AgentMultiDbManager instance.
     */
    public async createAgentMultiDbManager(): Promise<any> {
        const AgentMultiDbManager = await this.getAgentMultiDbManager();
        return new AgentMultiDbManager(this.workspaceRoot);
    }

    /**
     * Gets the agent plugin workspace root.
     */
    public getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }
}
