import { DatabasePluginAdapter } from '../plugins/database-plugin-adapter.js';
import * as path from 'path';
import { pathToFileURL } from 'url';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Database tools wrapper for 5D Database Plugin.
 * Provides access to database functionality via plugin adapter.
 */
export class DatabaseTools {
    private adapter: DatabasePluginAdapter;
    private dbManager: any;
    private idMapper: any;
    private moduleApi: any;
    private symbolApi: any;
    private dependencyApi: any;
    private adrApi: any;
    private changeApi: any;
    private crossDimensionApi: any;
    private ingestionApi: any;

    constructor(adapter: DatabasePluginAdapter) {
        this.adapter = adapter;
    }

    /**
     * Initializes database APIs.
     */
    public async initialize(): Promise<void> {
        if (!this.adapter.isAvailable()) {
            throw new Error('5D Database Plugin is not available');
        }

        this.dbManager = await this.adapter.createMultiDbManager();
        
        // Dynamically import APIs
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        // Import IdMapper
        const idMapperPath = path.join(pluginPath, 'out', 'core', 'id-mapper.js');
        const idMapperModule = await import(pathToFileURL(idMapperPath).href);
        this.idMapper = new idMapperModule.IdMapper(this.dbManager);

        // Import APIs
        const apiPath = path.join(pluginPath, 'out', 'api');
        const moduleApiModule = await import(pathToFileURL(path.join(apiPath, 'module-api.js')).href);
        const symbolApiModule = await import(pathToFileURL(path.join(apiPath, 'symbol-api.js')).href);
        const dependencyApiModule = await import(pathToFileURL(path.join(apiPath, 'dependency-api.js')).href);
        const adrApiModule = await import(pathToFileURL(path.join(apiPath, 'adr-api.js')).href);
        const changeApiModule = await import(pathToFileURL(path.join(apiPath, 'change-api.js')).href);
        const crossDimensionApiModule = await import(pathToFileURL(path.join(apiPath, 'cross-dimension-api.js')).href);
        const ingestionApiModule = await import(pathToFileURL(path.join(apiPath, 'ingestion-api.js')).href);

        this.moduleApi = new moduleApiModule.ModuleApi(this.dbManager);
        this.symbolApi = new symbolApiModule.SymbolApi(this.dbManager);
        this.dependencyApi = new dependencyApiModule.DependencyApi(this.dbManager);
        this.adrApi = new adrApiModule.AdrApi(this.dbManager);
        this.changeApi = new changeApiModule.ChangeApi(this.dbManager);
        this.crossDimensionApi = new crossDimensionApiModule.CrossDimensionApi(this.dbManager, this.idMapper);
        
        // Initialize IngestionApi with plugin root
        const pluginRoot = path.resolve(pluginPath);
        this.ingestionApi = new ingestionApiModule.IngestionApi(this.dbManager, pluginRoot);
    }

    /**
     * Query modules by file path.
     */
    public async queryModules(filePath: string, pluginId: string): Promise<any> {
        return await this.moduleApi.getModuleByPath(filePath, pluginId);
    }

    /**
     * Query symbols by path or symbol ID.
     */
    public async querySymbols(args: {
        path?: string;
        symbolId?: string;
        pluginId: string;
    }): Promise<any> {
        if (args.symbolId) {
            return await this.symbolApi.getSymbolById(args.symbolId, args.pluginId);
        } else if (args.path) {
            return await this.symbolApi.getSymbolsByPath(args.path, args.pluginId);
        } else {
            return await this.symbolApi.getAllSymbols(args.pluginId);
        }
    }

    /**
     * Query dependencies.
     */
    public async queryDependencies(args: {
        fromModule?: string;
        toModule?: string;
        pluginId: string;
    }): Promise<any> {
        if (args.fromModule) {
            return await this.dependencyApi.getDependenciesByFromModule(args.fromModule, args.pluginId);
        } else if (args.toModule) {
            return await this.dependencyApi.getDependenciesByToModule(args.toModule, args.pluginId);
        } else {
            return await this.dependencyApi.getAllDependencies(args.pluginId);
        }
    }

    /**
     * Query ADRs.
     */
    public async queryAdrs(adrNumberOrPath: string | number, pluginId: string): Promise<any> {
        let raw = String(adrNumberOrPath).trim();
        if (!raw) {
            throw new Error('adrNumberOrPath must not be empty');
        }

        // Normalize: Remove "ADR-" prefix if present (case-insensitive)
        // This handles inputs like "ADR-001", "adr-001", etc.
        const normalizedRaw = raw.replace(/^ADR-/i, '').trim();
        if (normalizedRaw !== raw) {
            raw = normalizedRaw;
        }

        // 1) Pure ADR number ("40", "040", "001")
        if (/^\d+$/.test(raw)) {
            return await this.adrApi.getAdrByNumber(raw, pluginId);
        }

        // 2) ADR filename that starts with a number ("040-unified-mcp-server.md", "040-unified-mcp-server")
        const leadingNumber = raw.match(/^(\d{1,4})\b/);
        if (leadingNumber) {
            return await this.adrApi.getAdrByNumber(leadingNumber[1], pluginId);
        }

        // 3) ADR markdown path ("docs/adr/040-*.md") → extract ADR number and query by number.
        const lowered = raw.toLowerCase();
        const looksLikeAdrMarkdownPath =
            lowered.endsWith('.md') ||
            lowered.includes('docs/adr') ||
            lowered.includes('/adr/') ||
            lowered.includes('\\adr\\');
        if (looksLikeAdrMarkdownPath) {
            const anyNumber = raw.match(/(\d{1,4})/);
            if (anyNumber) {
                return await this.adrApi.getAdrByNumber(anyNumber[1], pluginId);
            }
        }

        // 4) Otherwise treat as module file path and return ADRs mapped to that file.
        return await this.adrApi.getAdrsByFilePath(raw, pluginId);
    }

    /**
     * Query changes.
     */
    public async queryChanges(pluginId: string): Promise<any> {
        return await this.changeApi.getLatestChangeReport(pluginId);
    }

    /**
     * Cross-dimension analysis.
     */
    public async crossAnalysis(filePath: string, pluginId: string): Promise<any> {
        const adrs = await this.crossDimensionApi.getAdrsForFilePath(filePath, pluginId);
        const symbols = await this.crossDimensionApi.getSymbolsForModule(filePath, pluginId);
        return { adrs, symbols };
    }

    /**
     * Semantic discovery (uses Semantic Brain).
     */
    public async semanticDiscovery(args: {
        query: string;
        pluginId: string;
        limit?: number;
    }): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        // Import semantic discovery tool
        const semanticDiscoveryPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'semantic-discovery.js');
        const semanticDiscoveryModule = await import(pathToFileURL(semanticDiscoveryPath).href);
        
        return await semanticDiscoveryModule.executeSemanticDiscovery(
            args,
            this.dbManager,
            this.idMapper
        );
    }

    /**
     * System explanation.
     */
    public async systemExplanation(pluginId: string): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const systemExplanationPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'system-explanation.js');
        const systemExplanationModule = await import(pathToFileURL(systemExplanationPath).href);
        
        return await systemExplanationModule.executeSystemExplanation(
            { pluginId },
            this.dbManager
        );
    }

    /**
     * Learning path.
     */
    public async learningPath(topic: string, pluginId: string): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const learningPathPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'learning-path.js');
        const learningPathModule = await import(pathToFileURL(learningPathPath).href);
        
        return await learningPathModule.executeLearningPath(
            { topic, pluginId },
            this.dbManager
        );
    }

    /**
     * Bootstrap.
     */
    public async bootstrap(pluginId: string): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const bootstrapPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'bootstrap.js');
        const bootstrapModule = await import(pathToFileURL(bootstrapPath).href);
        
        return await bootstrapModule.executeBootstrap(
            { pluginId },
            this.dbManager
        );
    }

    /**
     * Gap analysis.
     * 
     * Finds documentation gaps by analyzing modules with many dependencies but few/no ADRs.
     * 
     * @param args.pluginId - Plugin ID
     * @param args.minDependencies - Minimum dependencies threshold (default: 5)
     * @param args.limit - Maximum number of gaps to return (default: 50)
     * @param args.autoGenerateAdrs - Automatically generate ADRs (default: false). 
     *                                 When false, provides context information for KI-Agent to create ADRs.
     * 
     * Returns gap analysis results with context_for_adr_generation for modules without ADRs,
     * including similar modules with ADRs, existing ADR patterns, dependency details, and cross-dimension context.
     */
    public async gapAnalysis(args: {
        pluginId: string;
        minDependencies?: number;
        limit?: number;
        autoGenerateAdrs?: boolean;
    }): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const gapAnalysisPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'gap-analysis.js');
        const gapAnalysisModule = await import(pathToFileURL(gapAnalysisPath).href);
        const GapAnalysisTool = gapAnalysisModule.GapAnalysisTool;
        
        const tool = new GapAnalysisTool(
            this.dbManager,
            this.idMapper,
            this.adapter.getWorkspaceRoot()
        );
        
        return await tool.execute(args);
    }

    /**
     * ADR generator.
     *
     * Exposes the 5D Database Plugin's deterministic ADR generator tool through the Unified MCP Server.
     */
    public async adrGenerator(args: {
        pluginId: string;
        minDependencies?: number;
        limit?: number;
        dryRun?: boolean;
        useLLM?: boolean;
        llmModel?: string;
    }): Promise<string> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const adrGeneratorPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'adr-generator.js');
        const adrGeneratorModule = await import(pathToFileURL(adrGeneratorPath).href);
        const AdrGeneratorTool = adrGeneratorModule.AdrGeneratorTool;

        const tool = new AdrGeneratorTool(
            this.dbManager,
            this.idMapper,
            this.adapter.getWorkspaceRoot()
        );

        return await tool.execute(args);
    }

    /**
     * Architecture mining.
     */
    public async architectureMining(args: {
        pluginId: string;
        filePath?: string;
    }): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const architectureMiningPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'architecture-mining.js');
        const architectureMiningModule = await import(pathToFileURL(architectureMiningPath).href);
        const ArchitectureMiningTool = architectureMiningModule.ArchitectureMiningTool;
        
        const tool = new ArchitectureMiningTool(this.dbManager, this.idMapper);
        return await tool.execute(args);
    }

    /**
     * Generate documentation (Noyrax).
     */
    public async generateDocumentation(pluginId: string): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const noyraxServicePath = path.join(pluginPath, 'out', 'services', 'noyrax-integration-service.js');
        const noyraxServiceModule = await import(pathToFileURL(noyraxServicePath).href);
        const NoyraxIntegrationService = noyraxServiceModule.NoyraxIntegrationService;
        
        const service = new NoyraxIntegrationService(this.adapter.getWorkspaceRoot());
        await service.generateDocumentation();
        
        return {
            success: true,
            message: 'Documentation generated successfully'
        };
    }

    /**
     * Check docs status.
     */
    public async checkDocsStatus(pluginId: string): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const noyraxServicePath = path.join(pluginPath, 'out', 'services', 'noyrax-integration-service.js');
        const noyraxServiceModule = await import(pathToFileURL(noyraxServicePath).href);
        const NoyraxIntegrationService = noyraxServiceModule.NoyraxIntegrationService;
        
        const service = new NoyraxIntegrationService(this.adapter.getWorkspaceRoot());
        return await service.checkDocsStatus();
    }

    /**
     * Run ingestion.
     */
    public async runIngestion(pluginId: string, full: boolean = true): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        // IMPORTANT: Do not run ingestion in-process in the Unified MCP Server.
        // Ingestion emits logs to stdout in multiple places, which would corrupt the MCP stdio protocol.
        // Instead, we cross a shell boundary and capture stdout/stderr.
        const ingestCliPath = path.join(pluginPath, 'out', 'cli', 'ingest-cli.js');
        if (!fs.existsSync(ingestCliPath)) {
            throw new Error(`Ingest CLI not found at ${ingestCliPath}`);
        }

        const workspaceRoot = this.adapter.getWorkspaceRoot();
        const fullFlag = full ? ' --full' : '';
        const command = `node "${ingestCliPath}" "${workspaceRoot}"${fullFlag}`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: workspaceRoot,
                env: { ...process.env },
                maxBuffer: 50 * 1024 * 1024 // 50MB buffer (ingestion can be chatty)
            });

            return {
                success: true,
                mode: full ? 'full' : 'incremental',
                pluginId,
                output: stdout,
                warnings: stderr && stderr.trim().length > 0 ? stderr : undefined
            };
        } catch (error: any) {
            const stdout = error?.stdout ? String(error.stdout) : '';
            const stderr = error?.stderr ? String(error.stderr) : '';
            const msg = error?.message || String(error);
            throw new Error(
                `Ingestion CLI failed: ${msg}\n` +
                (stderr ? `\n[stderr]\n${stderr}` : '') +
                (stdout ? `\n[stdout]\n${stdout}` : '')
            );
        }
    }

    /**
     * Check ingestion status.
     */
    public async checkIngestionStatus(pluginId: string): Promise<any> {
        if (!this.ingestionApi) {
            throw new Error('IngestionApi not initialized. Call initialize() first.');
        }
        return await this.ingestionApi.checkIngestionStatus();
    }
}

