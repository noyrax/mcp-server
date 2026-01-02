import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';

const execAsync = promisify(exec);

/**
 * Adapter for Documentation System Plugin CLI tools.
 * Uses shell boundary to call CLI tools (see ADR-025).
 */
export class DocumentationPluginAdapter {
    private workspaceRoot: string;
    private pluginPath?: string;

    constructor(workspaceRoot: string, pluginPath?: string) {
        this.workspaceRoot = workspaceRoot;
        this.pluginPath = pluginPath || this.findPluginPath();
    }

    /**
     * Finds Documentation System Plugin path.
     */
    private findPluginPath(): string | undefined {
        const possiblePaths = [
            path.join(this.workspaceRoot, 'documentation-system-plugin'),
            path.join(this.workspaceRoot, '..', 'documentation-system-plugin'),
            path.join(process.cwd(), 'documentation-system-plugin')
        ];

        for (const pluginPath of possiblePaths) {
            if (fs.existsSync(pluginPath) && fs.existsSync(path.join(pluginPath, 'package.json'))) {
                return pluginPath;
            }
        }

        // Fallback 1: resolve from workspace node_modules
        const workspaceNodeModules = path.join(this.workspaceRoot, 'node_modules', '@noyrax', 'documentation-system-plugin');
        if (fs.existsSync(workspaceNodeModules) && fs.existsSync(path.join(workspaceNodeModules, 'package.json'))) {
            return workspaceNodeModules;
        }

        // Fallback 2: resolve from node_modules (when installed as dependency of @noyrax/mcp-server)
        try {
            const require = createRequire(import.meta.url);
            // Try resolving relative to workspace root first (if installed in project)
            try {
                const pkgJsonPath = require.resolve('@noyrax/documentation-system-plugin/package.json', { paths: [this.workspaceRoot] });
                return path.dirname(pkgJsonPath);
            } catch {
                // Ignore and try default resolution
            }

            // Try default resolution (relative to this file)
            const pkgJsonPath = require.resolve('@noyrax/documentation-system-plugin/package.json');
            return path.dirname(pkgJsonPath);
        } catch {
            // ignore
        }

        return undefined;
    }

    /**
     * Checks if Documentation System Plugin is available.
     */
    public isAvailable(): boolean {
        if (!this.pluginPath) {
            return false;
        }

        // Check if CLI tools exist
        const cliPath = path.join(this.pluginPath, 'out', 'cli');
        return fs.existsSync(cliPath);
    }

    /**
     * Gets the plugin path.
     */
    public getPluginPath(): string | undefined {
        return this.pluginPath;
    }

    /**
     * Runs scan CLI tool.
     */
    public async runScan(options: {
        files?: string[];
        incremental?: boolean;
    } = {}): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        const scanCliPath = path.join(this.pluginPath, 'out', 'cli', 'scan-cli.js');
        if (!fs.existsSync(scanCliPath)) {
            throw new Error(`Scan CLI not found at ${scanCliPath}`);
        }

        const args: string[] = [];
        if (options.files && options.files.length > 0) {
            args.push('--files', ...options.files);
        }
        if (options.incremental !== undefined) {
            args.push(options.incremental ? '--incremental' : '--no-incremental');
        }

        const command = `node "${scanCliPath}" ${args.join(' ')}`;
        const { stdout, stderr } = await execAsync(command, {
            cwd: this.workspaceRoot,
            env: { ...process.env }
        });

        if (stderr) {
            console.error('[DocumentationPluginAdapter] stderr:', stderr);
        }

        try {
            return JSON.parse(stdout);
        } catch (error) {
            return { output: stdout, error: stderr };
        }
    }

    /**
     * Runs validate CLI tool.
     */
    public async runValidate(options: {
        files?: string[];
        verbose?: boolean;
    } = {}): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        const validateCliPath = path.join(this.pluginPath, 'out', 'cli', 'validate-cli.js');
        if (!fs.existsSync(validateCliPath)) {
            throw new Error(`Validate CLI not found at ${validateCliPath}`);
        }

        const args: string[] = [];
        if (options.files && options.files.length > 0) {
            args.push('--files', ...options.files);
        }
        if (options.verbose) {
            args.push('--verbose');
        }

        const command = `node "${validateCliPath}" ${args.join(' ')}`;
        const { stdout, stderr } = await execAsync(command, {
            cwd: this.workspaceRoot,
            env: { ...process.env }
        });

        if (stderr) {
            console.error('[DocumentationPluginAdapter] stderr:', stderr);
        }

        try {
            return JSON.parse(stdout);
        } catch (error) {
            return { output: stdout, error: stderr };
        }
    }

    /**
     * Runs generate CLI tool.
     */
    public async runGenerate(options: {
        outputPath?: string;
        full?: boolean;
        verbose?: boolean;
    } = {}): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        const generateCliPath = path.join(this.pluginPath, 'out', 'cli', 'generate-cli.js');
        if (!fs.existsSync(generateCliPath)) {
            throw new Error(`Generate CLI not found at ${generateCliPath}`);
        }

        const args: string[] = [];
        if (options.outputPath) {
            args.push('--output-path', options.outputPath);
        }
        if (options.full === true) {
            args.push('--full');
        }
        if (options.verbose === true) {
            args.push('--verbose');
        }

        const command = `node "${generateCliPath}" ${args.join(' ')}`;
        const { stdout, stderr } = await execAsync(command, {
            cwd: this.workspaceRoot,
            env: { ...process.env },
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        if (stderr) {
            console.error('[DocumentationPluginAdapter] stderr:', stderr);
        }

        try {
            return JSON.parse(stdout);
        } catch (error) {
            return { output: stdout, error: stderr };
        }
    }

    /**
     * Runs drift check CLI tool.
     */
    public async runDriftCheck(options: {
        since?: string;
    } = {}): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        // Drift check might be in a different location or not yet implemented
        // For now, return a placeholder
        return {
            status: 'not_implemented',
            message: 'Drift check CLI not yet available'
        };
    }

    /**
     * Runs impact analysis.
     */
    public async analyzeImpact(options: {
        file: string;
        symbol?: string;
    }): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        // Impact analysis might be in a different location
        // For now, return a placeholder
        return {
            status: 'not_implemented',
            message: 'Impact analysis CLI not yet available'
        };
    }

    /**
     * Runs ADR verification.
     */
    public async verifyAdrs(options: {
        verbose?: boolean;
    } = {}): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        const verifyAdrsPath = path.join(this.pluginPath, 'scripts', 'verify-adrs.js');
        if (!fs.existsSync(verifyAdrsPath)) {
            throw new Error(`Verify ADRs script not found at ${verifyAdrsPath}`);
        }

        const args: string[] = [];
        if (options.verbose) {
            args.push('--verbose');
        }

        const command = `node "${verifyAdrsPath}" ${args.join(' ')}`;
        const { stdout, stderr } = await execAsync(command, {
            cwd: this.workspaceRoot,
            env: { ...process.env }
        });

        if (stderr) {
            console.error('[DocumentationPluginAdapter] stderr:', stderr);
        }

        try {
            return JSON.parse(stdout);
        } catch (error) {
            return { output: stdout, error: stderr };
        }
    }
}

