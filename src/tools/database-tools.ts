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
    private vectorBackendStatusApi: any;

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
        const vectorBackendStatusApiModule = await import(pathToFileURL(path.join(apiPath, 'vector-backend-status-api.js')).href);

        this.moduleApi = new moduleApiModule.ModuleApi(this.dbManager);
        this.symbolApi = new symbolApiModule.SymbolApi(this.dbManager);
        this.dependencyApi = new dependencyApiModule.DependencyApi(this.dbManager);
        this.adrApi = new adrApiModule.AdrApi(this.dbManager);
        this.changeApi = new changeApiModule.ChangeApi(this.dbManager);
        this.crossDimensionApi = new crossDimensionApiModule.CrossDimensionApi(this.dbManager, this.idMapper);
        
        // Initialize IngestionApi with plugin root
        const pluginRoot = path.resolve(pluginPath);
        this.ingestionApi = new ingestionApiModule.IngestionApi(this.dbManager, pluginRoot);
        
        // Initialize VectorBackendStatusApi
        this.vectorBackendStatusApi = new vectorBackendStatusApiModule.VectorBackendStatusApi(this.dbManager);

        // Best-effort: open the V (vector) dimension so that vector_backend_status
        // reports the real backend/embedding state. Without this the V-dimension is
        // never opened in the MCP process and status wrongly reads "NOT_INSTALLED"
        // (which actually means "V not opened here", not "package missing").
        try {
            if (typeof this.dbManager?.getDatabase === 'function') {
                await this.dbManager.getDatabase('V');
            }
        } catch {
            // Leave V unopened; vector_backend_status will surface the concrete reason.
        }
    }

    /**
     * Query modules by file path.
     */
    public async queryModules(filePath: string, pluginId: string): Promise<any> {
        const module = await this.moduleApi.getModuleByPath(filePath, pluginId);
        
        // Add evidence (FACT - direct DB query)
        const evidence = {
            grade: 'FACT' as const,
            sources: [{
                type: 'DB_QUERY' as const,
                id: module?.id,
                path: filePath,
                metadata: { dimension: 'X', pluginId }
            }],
            description: 'Module data from database query'
        };
        
        // Return consistent structure even if module is null
        if (module === null) {
            return {
                evidence
            };
        }
        
        return {
            ...module,
            evidence
        };
    }

    /**
     * Query all modules.
     */
    public async queryAllModules(pluginId: string): Promise<any[]> {
        return await this.moduleApi.getAllModules(pluginId);
    }

    /**
     * Query symbols by path or symbol ID.
     */
    public async querySymbols(args: {
        path?: string;
        symbolId?: string;
        pluginId: string;
    }): Promise<any> {
        let result: any;
        let evidenceSources: Array<{ type: 'DB_QUERY'; id?: string; path?: string; metadata?: Record<string, any> }> = [];
        
        if (args.symbolId) {
            result = await this.symbolApi.getSymbolById(args.symbolId, args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                id: args.symbolId,
                metadata: { dimension: 'Y', pluginId: args.pluginId, queryType: 'byId' }
            });
        } else if (args.path) {
            result = await this.symbolApi.getSymbolsByPath(args.path, args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                path: args.path,
                metadata: { dimension: 'Y', pluginId: args.pluginId, queryType: 'byPath' }
            });
        } else {
            result = await this.symbolApi.getAllSymbols(args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                metadata: { dimension: 'Y', pluginId: args.pluginId, queryType: 'all' }
            });
        }
        
        // Add evidence (FACT - direct DB query)
        const evidence = {
            grade: 'FACT' as const,
            sources: evidenceSources,
            description: 'Symbol data from database query'
        };
        
        // If result is array, wrap it; otherwise add evidence directly
        if (Array.isArray(result)) {
            return {
                symbols: result,
                evidence
            };
        } else if (result === null || result === undefined) {
            // Return consistent structure even if result is null
            return {
                symbols: [],
                evidence
            };
        } else {
            return {
                ...result,
                evidence
            };
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
        let result: any;
        let evidenceSources: Array<{ type: 'DB_QUERY'; path?: string; metadata?: Record<string, any> }> = [];
        
        if (args.fromModule) {
            result = await this.dependencyApi.getDependenciesByFromModule(args.fromModule, args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                path: args.fromModule,
                metadata: { dimension: 'Z', pluginId: args.pluginId, queryType: 'fromModule' }
            });
        } else if (args.toModule) {
            result = await this.dependencyApi.getDependenciesByToModule(args.toModule, args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                path: args.toModule,
                metadata: { dimension: 'Z', pluginId: args.pluginId, queryType: 'toModule' }
            });
        } else {
            result = await this.dependencyApi.getAllDependencies(args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                metadata: { dimension: 'Z', pluginId: args.pluginId, queryType: 'all' }
            });
        }
        
        // Add evidence (FACT - direct DB query)
        const evidence = {
            grade: 'FACT' as const,
            sources: evidenceSources,
            description: 'Dependency data from database query'
        };
        
        // If result is array, wrap it; otherwise add evidence directly
        if (Array.isArray(result)) {
            return {
                dependencies: result,
                evidence
            };
        } else if (result === null || result === undefined) {
            // Return consistent structure even if result is null
            return {
                dependencies: [],
                evidence
            };
        } else {
            return {
                ...result,
                evidence
            };
        }
    }

    /**
     * Query all ADRs.
     */
    public async queryAllAdrs(pluginId: string): Promise<any[]> {
        return await this.adrApi.getAllAdrs(pluginId);
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

        let result: any;
        let evidenceSources: Array<{ type: 'DB_QUERY'; id?: string; path?: string; metadata?: Record<string, any> }> = [];

        // 1) Pure ADR number ("40", "040", "001")
        if (/^\d+$/.test(raw)) {
            result = await this.adrApi.getAdrByNumber(raw, pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                id: `ADR-${raw}`,
                metadata: { dimension: 'W', pluginId, queryType: 'byNumber', adrNumber: raw }
            });
        }
        // 2) ADR filename that starts with a number ("040-unified-mcp-server.md", "040-unified-mcp-server")
        else {
            const leadingNumber = raw.match(/^(\d{1,4})\b/);
            if (leadingNumber) {
                result = await this.adrApi.getAdrByNumber(leadingNumber[1], pluginId);
                evidenceSources.push({
                    type: 'DB_QUERY',
                    id: `ADR-${leadingNumber[1]}`,
                    metadata: { dimension: 'W', pluginId, queryType: 'byNumber', adrNumber: leadingNumber[1] }
                });
            }
            // 3) ADR markdown path ("docs/adr/040-*.md") → extract ADR number and query by number.
            else {
                const lowered = raw.toLowerCase();
                const looksLikeAdrMarkdownPath =
                    lowered.endsWith('.md') ||
                    lowered.includes('docs/adr') ||
                    lowered.includes('/adr/') ||
                    lowered.includes('\\adr\\');
                if (looksLikeAdrMarkdownPath) {
                    const anyNumber = raw.match(/(\d{1,4})/);
                    if (anyNumber) {
                        result = await this.adrApi.getAdrByNumber(anyNumber[1], pluginId);
                        evidenceSources.push({
                            type: 'DB_QUERY',
                            id: `ADR-${anyNumber[1]}`,
                            metadata: { dimension: 'W', pluginId, queryType: 'byNumber', adrNumber: anyNumber[1] }
                        });
                    }
                }
                // 4) Otherwise treat as module file path and return ADRs mapped to that file.
                else {
                    result = await this.adrApi.getAdrsByFilePath(raw, pluginId);
                    evidenceSources.push({
                        type: 'DB_QUERY',
                        path: raw,
                        metadata: { dimension: 'W', pluginId, queryType: 'byFilePath' }
                    });
                }
            }
        }

        // Add evidence (FACT - direct DB query)
        const evidence = {
            grade: 'FACT' as const,
            sources: evidenceSources,
            description: 'ADR data from database query'
        };

        // If result is array, wrap it; otherwise add evidence directly
        if (Array.isArray(result)) {
            return {
                adrs: result,
                evidence
            };
        } else if (result === null || result === undefined) {
            // Return consistent structure even if result is null
            // For single ADR queries, return null explicitly
            return {
                evidence
            };
        } else {
            return {
                ...result,
                evidence
            };
        }
    }

    /**
     * Query changes.
     */
    public async queryChanges(pluginId: string): Promise<any> {
        const changeReport = await this.changeApi.getLatestChangeReport(pluginId);
        
        // Add evidence (FACT - direct DB query)
        const evidence = {
            grade: 'FACT' as const,
            sources: [{
                type: 'DB_QUERY' as const,
                metadata: { dimension: 'T', pluginId }
            }],
            description: 'Change report data from database query'
        };
        
        // Return consistent structure even if changeReport is null
        if (changeReport === null || changeReport === undefined) {
            return {
                evidence
            };
        }
        
        return {
            ...changeReport,
            evidence
        };
    }

    /**
     * Query all change reports.
     */
    public async queryAllChanges(pluginId: string): Promise<any[]> {
        return await this.changeApi.getAllChangeReports(pluginId);
    }

    /**
     * Query embeddings metadata (without vectors).
     */
    public async queryEmbeddings(pluginId: string): Promise<any[]> {
        try {
            const vDb = await this.dbManager.getDatabase('V');
            if (!vDb) {
                return [];
            }

            // Dynamically import EmbeddingRepository
            const pluginPath = this.adapter.getPluginPath();
            if (!pluginPath) {
                return [];
            }

            const embeddingRepoPath = path.join(pluginPath, 'out', 'repositories', 'embedding-repository.js');
            const embeddingRepoModule = await import(pathToFileURL(embeddingRepoPath).href);
            const embeddingRepo = new embeddingRepoModule.EmbeddingRepository(vDb);
            
            // Get all embeddings
            const allEmbeddings = await embeddingRepo.getAll(pluginId);
            
            // Remove embedding_vector from metadata (too large for snapshot)
            return allEmbeddings.map((emb: any) => {
                const { embedding_vector, ...metadata } = emb;
                return {
                    ...metadata,
                    has_vector: embedding_vector ? true : false,
                    vector_size: embedding_vector ? embedding_vector.length : 0
                };
            });
        } catch (error) {
            return [];
        }
    }

    /**
     * Cross-dimension analysis.
     */
    public async crossAnalysis(filePath: string, pluginId: string): Promise<any> {
        const adrs = await this.crossDimensionApi.getAdrsForFilePath(filePath, pluginId);
        const symbols = await this.crossDimensionApi.getSymbolsForModule(filePath, pluginId);
        
        // Add evidence (INFERRED - from multiple DB queries)
        const evidence = {
            grade: 'INFERRED' as const,
            sources: [
                {
                    type: 'DB_QUERY' as const,
                    path: filePath,
                    metadata: { dimension: 'W', pluginId, queryType: 'adrsForFilePath' }
                },
                {
                    type: 'DB_QUERY' as const,
                    path: filePath,
                    metadata: { dimension: 'Y', pluginId, queryType: 'symbolsForModule' }
                }
            ],
            description: 'Cross-dimension analysis derived from multiple database queries (ADRs and symbols)'
        };
        
        return {
            adrs,
            symbols,
            evidence
        };
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
        
        const resultStr = await semanticDiscoveryModule.executeSemanticDiscovery(
            args,
            this.dbManager,
            this.idMapper
        );
        
        // Parse result (it's a JSON string)
        const result = JSON.parse(resultStr);
        
        // Determine evidence grade based on mode
        const isFallback = result.mode === 'fallback';
        const evidenceGrade: 'FACT' | 'INFERRED' = isFallback ? 'INFERRED' : 'FACT';
        const evidence = {
            grade: evidenceGrade,
            sources: [{
                type: 'DB_QUERY' as const,
                metadata: {
                    dimension: 'V',
                    pluginId: args.pluginId,
                    queryType: 'semantic_discovery',
                    query: args.query,
                    mode: result.mode,
                    reason_code: result.reason_code
                }
            }],
            description: isFallback
                ? 'Semantic discovery in fallback mode (vector backend unavailable)'
                : 'Semantic discovery from vector database query'
        };
        
        return {
            ...result,
            evidence
        };
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
        
        // executeSystemExplanation already returns JSON string (via JSON.stringify)
        const resultStr = await systemExplanationModule.executeSystemExplanation(
            { pluginId },
            this.dbManager
        );
        
        // Parse result to add evidence
        const result = JSON.parse(resultStr);
        
        // Add evidence (INFERRED - from multiple DB queries and system metadata)
        const evidence = {
            grade: 'INFERRED' as const,
            sources: [
                {
                    type: 'DB_QUERY' as const,
                    metadata: { dimension: 'X', pluginId, queryType: 'modules' }
                },
                {
                    type: 'DB_QUERY' as const,
                    metadata: { dimension: 'W', pluginId, queryType: 'adrs' }
                },
                {
                    type: 'SYSTEM_METADATA' as const,
                    metadata: { pluginId }
                }
            ],
            description: 'System explanation derived from multiple database queries and system metadata'
        };
        
        // Add evidence to result (if it's an object) or wrap it
        const resultWithEvidence = {
            ...result,
            evidence
        };
        
        // Return as object (consistent with other databaseTools methods)
        return resultWithEvidence;
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
        
        // executeLearningPath already returns JSON string (via JSON.stringify)
        const resultStr = await learningPathModule.executeLearningPath(
            { topic, pluginId },
            this.dbManager
        );
        
        // Parse JSON string and return as object (consistent with other databaseTools methods)
        return JSON.parse(resultStr);
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
        
        // executeBootstrap already returns JSON string (via JSON.stringify)
        const resultStr = await bootstrapModule.executeBootstrap(
            { pluginId },
            this.dbManager
        );
        
        // Parse JSON string and return as object (consistent with other databaseTools methods)
        return JSON.parse(resultStr);
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
        
        const resultStr = await tool.execute(args);
        const result = JSON.parse(resultStr);
        
        // Add evidence (INFERRED - from multiple DB queries)
        const evidence = {
            grade: 'INFERRED' as const,
            sources: [
                {
                    type: 'DB_QUERY' as const,
                    metadata: { dimension: 'X', pluginId: args.pluginId, queryType: 'modules' }
                },
                {
                    type: 'DB_QUERY' as const,
                    metadata: { dimension: 'Z', pluginId: args.pluginId, queryType: 'dependencies' }
                },
                {
                    type: 'DB_QUERY' as const,
                    metadata: { dimension: 'W', pluginId: args.pluginId, queryType: 'adrs' }
                }
            ],
            description: 'Gap analysis derived from multiple database queries (modules, dependencies, and ADRs)'
        };
        
        return {
            ...result,
            evidence
        };
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
    }): Promise<any> {
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

        const resultStr = await tool.execute(args);
        
        // Parse JSON string and return as object (consistent with other databaseTools methods)
        return JSON.parse(resultStr);
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
     * 
     * @param pluginId Plugin ID
     * @param full Whether to run full ingestion (default: true)
     * @param cleanup Whether to cleanup old databases with different plugin ID (default: false, auto-cleanup on --full if mismatch detected)
     */
    public async runIngestion(pluginId: string, full: boolean = true, cleanup: boolean = false): Promise<any> {
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
        const cleanupFlag = cleanup ? ' --cleanup' : '';
        const command = `node "${ingestCliPath}" "${workspaceRoot}"${fullFlag}${cleanupFlag}`;

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

    /**
     * Get vector backend status.
     */
    public async getVectorBackendStatus(): Promise<any> {
        if (!this.vectorBackendStatusApi) {
            throw new Error('VectorBackendStatusApi not initialized. Call initialize() first.');
        }
        return await this.vectorBackendStatusApi.getVectorBackendStatus();
    }

    /**
     * Healthcheck vector backend.
     */
    public async healthcheckVectorBackend(): Promise<any> {
        if (!this.vectorBackendStatusApi) {
            throw new Error('VectorBackendStatusApi not initialized. Call initialize() first.');
        }
        return await this.vectorBackendStatusApi.healthcheckVectorBackend();
    }

    /**
     * Get source access contract.
     */
    public async sourceAccessContract(args?: { workspaceRoot?: string }): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const sourceAccessContractPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'source-access-contract.js');
        const sourceAccessContractModule = await import(pathToFileURL(sourceAccessContractPath).href);
        
        return await sourceAccessContractModule.executeSourceAccessContract(
            args || {},
            this.dbManager
        );
    }

    /**
     * Fetch source code snippet.
     */
    public async sourceSnippet(args: {
        symbol_id?: string;
        file_path?: string;
        start_line?: number;
        end_line?: number;
        content_hash?: string;
        include_context?: boolean;
        context_lines?: number;
        verify_hash?: boolean;
        pluginId: string;
        workspaceRoot?: string;
    }): Promise<any> {
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        const sourceSnippetPath = path.join(pluginPath, 'out', 'mcp', 'tools', 'source-snippet.js');
        const sourceSnippetModule = await import(pathToFileURL(sourceSnippetPath).href);
        
        // Ensure workspaceRoot is passed (use adapter's workspace root if not provided)
        const workspaceRoot = args.workspaceRoot || this.adapter.getWorkspaceRoot();
        
        return await sourceSnippetModule.executeSourceSnippet(
            { ...args, workspaceRoot },
            this.dbManager
        );
    }
}

