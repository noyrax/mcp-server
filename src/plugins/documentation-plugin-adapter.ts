import * as path from 'path';
import * as fs from 'fs';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { runDriftCheck as runDriftCheckLocal } from '../tools/drift-tools.js';
import { analyzeImpact as analyzeImpactLocal } from '../tools/impact-tools.js';

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
        const findInNodeModulesUpwards = (startDir: string, maxDepth: number = 6): string | undefined => {
            let currentDir = path.resolve(startDir);
            for (let depth = 0; depth <= maxDepth; depth++) {
                const scoped = path.join(currentDir, 'node_modules', '@noyrax', 'documentation-system-plugin');
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
            path.join(this.workspaceRoot, 'documentation-system-plugin'),
            path.join(this.workspaceRoot, '..', 'documentation-system-plugin'),
            path.join(process.cwd(), 'documentation-system-plugin')
        ];

        for (const pluginPath of possiblePaths) {
            if (fs.existsSync(pluginPath) && fs.existsSync(path.join(pluginPath, 'package.json'))) {
                return pluginPath;
            }
        }

        // Fallback 1: resolve from workspace node_modules (including parent directories)
        const workspaceNodeModules = findInNodeModulesUpwards(this.workspaceRoot);
        if (workspaceNodeModules) {
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

        // Fallback 3: Check global npm installation
        try {
            const globalNodeModules = execSync('npm root -g', { encoding: 'utf-8' }).trim();
            const globalPluginPath = path.join(globalNodeModules, '@noyrax', 'documentation-system-plugin');
            if (fs.existsSync(globalPluginPath) && fs.existsSync(path.join(globalPluginPath, 'package.json'))) {
                return globalPluginPath;
            }
        } catch {
            // ignore - npm root -g might fail or not be available
        }

        // Fallback 4: Common global npm paths (Windows and Unix)
        const commonGlobalPaths = [
            // Windows
            path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@noyrax', 'documentation-system-plugin'),
            // Unix/Mac
            path.join('/usr', 'local', 'lib', 'node_modules', '@noyrax', 'documentation-system-plugin'),
            path.join(process.env.HOME || '', '.npm-global', 'node_modules', '@noyrax', 'documentation-system-plugin'),
            path.join(process.env.HOME || '', '.nvm', 'versions', 'node', 'v*', 'lib', 'node_modules', '@noyrax', 'documentation-system-plugin')
        ];

        for (const globalPath of commonGlobalPaths) {
            if (fs.existsSync(globalPath) && fs.existsSync(path.join(globalPath, 'package.json'))) {
                return globalPath;
            }
        }

        return undefined;
    }

    /**
     * Checks if Documentation System Plugin is available.
     * Returns true if:
     * 1. CLI files exist (already compiled), OR
     * 2. Plugin is installed (package.json exists with compile script) - will be compiled on first use
     */
    public isAvailable(): boolean {
        if (!this.pluginPath) {
            return false;
        }

        // Check 1: CLI tools exist (already compiled)
        const scanCliPath = path.join(this.pluginPath, 'out', 'cli', 'scan-cli.js');
        const validateCliPath = path.join(this.pluginPath, 'out', 'cli', 'validate-cli.js');
        
        if (fs.existsSync(scanCliPath) && fs.existsSync(validateCliPath)) {
            return true;
        }

        // Check 2: Plugin is installed (package.json exists with compile script)
        // This allows tools to be registered even if not compiled yet
        // ensureCompiled() will compile it on first use
        const packageJsonPath = path.join(this.pluginPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (packageJson.scripts && packageJson.scripts.compile) {
                    // Plugin is installed and can be compiled
                    return true;
                }
            } catch {
                // Ignore parse errors
            }
        }

        return false;
    }

    /**
     * Gets the plugin path.
     */
    public getPluginPath(): string | undefined {
        return this.pluginPath;
    }

    /**
     * Gets detailed availability information for debugging.
     */
    public getAvailabilityInfo(): {
        pluginPath: string | undefined;
        exists: boolean;
        hasOutCli: boolean;
        hasPackageJson: boolean;
        hasCliScripts: boolean;
        resolvedFrom: string;
    } {
        const info = {
            pluginPath: this.pluginPath,
            exists: this.pluginPath !== undefined && fs.existsSync(this.pluginPath || ''),
            hasOutCli: false,
            hasPackageJson: false,
            hasCliScripts: false,
            resolvedFrom: 'unknown'
        };
        
        if (this.pluginPath) {
            info.hasOutCli = fs.existsSync(path.join(this.pluginPath, 'out', 'cli'));
            const packageJsonPath = path.join(this.pluginPath, 'package.json');
            info.hasPackageJson = fs.existsSync(packageJsonPath);
            
            if (info.hasPackageJson) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    info.hasCliScripts = !!(
                        (packageJson.scripts && (
                            packageJson.scripts['scan:cli'] ||
                            packageJson.scripts['validate:cli'] ||
                            packageJson.scripts['generate:cli']
                        )) ||
                        packageJson.bin
                    );
                } catch {
                    // ignore
                }
            }
            
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
     * Ensures the plugin is compiled. Attempts to compile if CLI files are missing.
     */
    private async ensureCompiled(): Promise<void> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        const scanCliPath = path.join(this.pluginPath, 'out', 'cli', 'scan-cli.js');
        if (fs.existsSync(scanCliPath)) {
            return; // Already compiled
        }

        // Try to compile the plugin
        const packageJsonPath = path.join(this.pluginPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`Plugin package.json not found at ${packageJsonPath}. Plugin may not be properly installed.`);
        }

        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            if (!packageJson.scripts || !packageJson.scripts.compile) {
                throw new Error(`Plugin package.json does not have a compile script. Plugin may not be properly installed.`);
            }

            console.warn(`[DocumentationPluginAdapter] CLI files not found. Attempting to compile plugin at ${this.pluginPath}...`);
            
            // Compile the plugin
            const execAsync = promisify(exec);
            const { stdout, stderr } = await execAsync('npm run compile', {
                cwd: this.pluginPath,
                encoding: 'utf-8',
                maxBuffer: 10 * 1024 * 1024 // 10MB
            });

            if (stderr && !stderr.includes('npm WARN')) {
                console.warn(`[DocumentationPluginAdapter] Compilation warnings: ${stderr}`);
            }

            // Verify compilation succeeded
            if (!fs.existsSync(scanCliPath)) {
                throw new Error(`Compilation completed but scan-cli.js still not found at ${scanCliPath}. Compilation may have failed.`);
            }

            console.log(`[DocumentationPluginAdapter] Plugin compiled successfully.`);
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to compile Documentation System Plugin: ${errorMessage}. Please compile manually: cd ${this.pluginPath} && npm run compile`);
        }
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

        // Ensure plugin is compiled before running
        await this.ensureCompiled();

        const scanCliPath = path.join(this.pluginPath, 'out', 'cli', 'scan-cli.js');
        if (!fs.existsSync(scanCliPath)) {
            throw new Error(`Scan CLI not found at ${scanCliPath} after compilation attempt`);
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

        // Ensure plugin is compiled before running
        await this.ensureCompiled();

        const validateCliPath = path.join(this.pluginPath, 'out', 'cli', 'validate-cli.js');
        if (!fs.existsSync(validateCliPath)) {
            throw new Error(`Validate CLI not found at ${validateCliPath} after compilation attempt`);
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

        // Workspace Root Validierung
        // WICHTIG: Alle Logs nach stderr, damit stdout nur JSON enthält
        console.error(`[DocumentationPluginAdapter] Workspace Root: ${this.workspaceRoot}`);
        if (!fs.existsSync(this.workspaceRoot)) {
            throw new Error(`Workspace Root does not exist: ${this.workspaceRoot}`);
        }
        
        // Prüfen, ob Source-Dateien existieren
        const possibleSourceDirs = [
            path.join(this.workspaceRoot, 'vscode-extension', 'src'),
            path.join(this.workspaceRoot, 'src'),
            path.join(this.workspaceRoot, 'documentation-system-plugin', 'src'),
            path.join(this.workspaceRoot, '5d-database-plugin', 'src'),
            path.join(this.workspaceRoot, 'mcp-server', 'src')
        ];
        
        const foundSourceDirs = possibleSourceDirs.filter(dir => fs.existsSync(dir));
        if (foundSourceDirs.length === 0) {
            console.error(`[DocumentationPluginAdapter] WARNUNG: Keine Source-Verzeichnisse gefunden in ${this.workspaceRoot}. Möglicherweise falscher Workspace Root.`);
        } else {
            console.error(`[DocumentationPluginAdapter] Gefundene Source-Verzeichnisse: ${foundSourceDirs.map(d => path.relative(this.workspaceRoot, d)).join(', ')}`);
        }

        // Ensure plugin is compiled before running
        await this.ensureCompiled();

        const generateCliPath = path.join(this.pluginPath, 'out', 'cli', 'generate-cli.js');
        if (!fs.existsSync(generateCliPath)) {
            throw new Error(`Generate CLI not found at ${generateCliPath} after compilation attempt`);
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

        // Filter stdout: Nur JSON-Zeilen extrahieren (CLI gibt JSON aus, aber es könnten andere Logs dazwischen sein)
        // Suche nach der letzten JSON-Zeile (beginnt mit { und endet mit })
        const lines = stdout.split('\n');
        let jsonLine = '';
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.endsWith('}')) {
                jsonLine = line;
                break;
            }
        }

        // Falls keine JSON-Zeile gefunden, versuche die gesamte stdout zu parsen
        const jsonString = jsonLine || stdout.trim();

        try {
            return JSON.parse(jsonString);
        } catch (error) {
            // Falls Parsing fehlschlägt, gib die rohe Ausgabe zurück für Debugging
            console.error('[DocumentationPluginAdapter] Failed to parse JSON from stdout:', error);
            console.error('[DocumentationPluginAdapter] stdout (first 500 chars):', stdout.substring(0, 500));
            return { 
                status: 'error', 
                message: 'Failed to parse CLI output as JSON',
                output: stdout.substring(0, 1000), 
                error: stderr,
                parseError: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Runs drift check tool.
     * Uses local implementation migrated from documentation-system-plugin/mcp/src/tools/drift.ts
     */
    public async runDriftCheck(options: {
        since?: string;
    } = {}): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        try {
            // Use local implementation (migrated to mcp-server/src/tools/drift-tools.ts)
            // WICHTIG: docs/ muss im Workspace-Root sein (wird von Noyrax generiert)
            const result = await runDriftCheckLocal({
                since: options.since,
                workspaceRoot: this.workspaceRoot
            });
            return result;
        } catch (error: any) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                status: 'error',
                message: `Drift check failed: ${errorMsg}`,
                error: errorMsg
            };
        }
    }

    /**
     * Runs impact analysis.
     * Uses local implementation migrated from documentation-system-plugin/mcp/src/tools/impact.ts
     */
    public async analyzeImpact(options: {
        file: string;
        symbol?: string;
    }): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin not found');
        }

        try {
            // Use local implementation (migrated to mcp-server/src/tools/impact-tools.ts)
            // WICHTIG: docs/ muss im Workspace-Root sein (wird von Noyrax generiert)
            const result = await analyzeImpactLocal({
                file: options.file,
                symbol: options.symbol,
                workspaceRoot: this.workspaceRoot
            });
            return result;
        } catch (error: any) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                status: 'error',
                message: `Impact analysis failed: ${errorMsg}`,
                error: errorMsg
            };
        }
    }

    /**
     * Runs ADR verification.
     * Note: This only requires the plugin path, not full plugin availability.
     */
    public async verifyAdrs(options: {
        verbose?: boolean;
    } = {}): Promise<any> {
        if (!this.pluginPath) {
            throw new Error('Documentation System Plugin path not found');
        }

        const verifyAdrsPath = path.join(this.pluginPath, 'scripts', 'verify-adrs.js');
        if (!fs.existsSync(verifyAdrsPath)) {
            throw new Error(`Verify ADRs script not found at ${verifyAdrsPath}. Plugin may not be installed or compiled.`);
        }

        const args: string[] = [];
        if (options.verbose) {
            args.push('--verbose');
        }

        const command = `node "${verifyAdrsPath}" ${args.join(' ')}`;
        let stdout: string;
        let stderr: string;
        try {
            const result = await execAsync(command, {
                cwd: this.workspaceRoot,
                env: { ...process.env }
            });
            stdout = result.stdout;
            stderr = result.stderr;
        } catch (err: any) {
            // verify-adrs.js exits 1 when verification finds errors — that's a semantic signal,
            // not a runtime failure. Preserve stdout so callers can read the verification report.
            if (typeof err?.stdout === 'string') {
                stdout = err.stdout;
                stderr = typeof err.stderr === 'string' ? err.stderr : '';
            } else {
                throw err;
            }
        }

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

