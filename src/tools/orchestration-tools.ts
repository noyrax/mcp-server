import { DatabaseTools } from './database-tools.js';
import { ValidationTools } from './validation-tools.js';
import { SystemContractGenerator } from './system-contract-generator.js';
import { WorkspaceResolver } from '../workspace-resolver.js';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import * as crypto from 'crypto';

/**
 * Orchestration tools for workflow coordination.
 * Combines Database and Validation tools for complete workflows.
 */
export class OrchestrationTools {
    private databaseTools: DatabaseTools;
    private validationTools: ValidationTools;
    private workspaceRoot: string;

    constructor(
        databaseTools: DatabaseTools,
        validationTools: ValidationTools,
        workspaceRoot: string
    ) {
        this.databaseTools = databaseTools;
        this.validationTools = validationTools;
        this.workspaceRoot = workspaceRoot;
    }

    private resolvePluginId(provided?: string): string {
        const raw = String(provided ?? '').trim();

        const aliasValues = new Set([
            '',
            '.',
            'default',  // ✅ Fix: Add "default" explicitly
            'documentation-system-plugin',
            '@noyrax/documentation-system-plugin',
            '5d-database-plugin',
            '@noyrax/5d-database-plugin'
        ]);

        const isValidPluginId = (value: string): boolean => /^[0-9a-f]{16}$/i.test(value);

        if (raw && !aliasValues.has(raw)) {
            if (isValidPluginId(raw)) {
                return raw.toLowerCase();
            }
            // fall through → compute
        }

        // Mirror 5D Database Plugin's MultiDbManager plugin_id strategy:
        // SHA256(normalized workspaceRoot) → first 16 hex chars.
        const normalizedPath = path.resolve(this.workspaceRoot).replace(/\\/g, '/').toLowerCase();
        const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
        return hash.substring(0, 16);
    }

    /**
     * Full cycle workflow: Scan → Generate → Validate → Ingest → Embeddings
     */
    public async fullCycle(pluginId: string): Promise<any> {
        const steps: any[] = [];
        const errors: string[] = [];

        try {
            // Step 1: Scan
            steps.push({ step: 'scan', status: 'running' });
            const scanResult = await this.validationTools.runScan({ incremental: true });
            steps[steps.length - 1] = { step: 'scan', status: 'completed', result: scanResult };

            // Step 2: Generate (via Documentation System Plugin CLI)
            steps.push({ step: 'generate', status: 'running' });
            const generateResult = await this.validationTools.runGenerate({ full: true });
            steps[steps.length - 1] = { step: 'generate', status: 'completed', result: generateResult };

            // Step 3: Validate
            steps.push({ step: 'validate', status: 'running' });
            const validateResult = await this.validationTools.runValidate();
            steps[steps.length - 1] = { step: 'validate', status: 'completed', result: validateResult };

            // Step 4: Ingest
            steps.push({ step: 'ingest', status: 'running' });
            try {
                const ingestResult = await this.databaseTools.runIngestion(pluginId, true);
                steps[steps.length - 1] = { step: 'ingest', status: 'completed', result: ingestResult };
            } catch (error: any) {
                errors.push(`Ingestion failed: ${error.message || String(error)}`);
                steps[steps.length - 1] = { step: 'ingest', status: 'failed', error: error.message || String(error) };
            }

            // Step 5: Embeddings (generated during ingestion via IngestionOrchestrator)
            steps.push({ step: 'embeddings', status: 'running' });
            const embeddingStatus = await this.checkEmbeddingStatus();
            // Embeddings are generated during ingestion (IngestionOrchestrator calls embeddingPipeline.syncEmbeddings)
            // So if ingestion succeeded, embeddings should be available
            const embeddingsGenerated = steps.find(s => s.step === 'ingest')?.status === 'completed';
            if (embeddingsGenerated) {
                steps[steps.length - 1] = { 
                    step: 'embeddings', 
                    status: 'completed', 
                    message: 'Embeddings generated during ingestion (using EMBEDDING_STRATEGY from environment)' 
                };
            } else {
                steps[steps.length - 1] = { 
                    step: 'embeddings', 
                    status: embeddingStatus.needed ? 'pending' : 'skipped', 
                    message: embeddingStatus.message 
                };
            }

            return {
                status: 'completed',
                steps,
                errors: errors.length > 0 ? errors : undefined
            };
        } catch (error: any) {
            errors.push(error.message || String(error));
            return {
                status: 'failed',
                steps,
                errors
            };
        }
    }

    /**
     * Generate and ingest workflow.
     */
    public async generateAndIngest(pluginId: string): Promise<any> {
        const steps: any[] = [];
        const errors: string[] = [];

        try {
            // Step 1: Generate
            steps.push({ step: 'generate', status: 'running' });
            const generateResult = await this.validationTools.runGenerate({ full: true });
            steps[steps.length - 1] = { step: 'generate', status: 'completed', result: generateResult };

            // Step 2: Ingest
            steps.push({ step: 'ingest', status: 'running' });
            try {
                const ingestResult = await this.databaseTools.runIngestion(pluginId, true);
                steps[steps.length - 1] = { step: 'ingest', status: 'completed', result: ingestResult };
            } catch (error: any) {
                errors.push(`Ingestion failed: ${error.message || String(error)}`);
                steps[steps.length - 1] = { step: 'ingest', status: 'failed', error: error.message || String(error) };
            }

            return {
                status: 'completed',
                steps,
                errors: errors.length > 0 ? errors : undefined
            };
        } catch (error: any) {
            errors.push(error.message || String(error));
            return {
                status: 'failed',
                steps,
                errors
            };
        }
    }

    /**
     * Check system status.
     */
    public async checkStatus(pluginId?: string): Promise<any> {
        const resolvedPluginId = this.resolvePluginId(pluginId);
        // Keep existing fields stable (docs/databases/embeddings/plugins) and only ADD additional
        // guidance fields to avoid breaking existing clients.
        const status: any = {
            docs: { exists: false, path: null },
            databases: { exists: false, path: null },
            embeddings: { exists: false, path: null }
        };

        // Check docs/
        const docsPath = WorkspaceResolver.findDocsDirectory(this.workspaceRoot);
        if (docsPath) {
            status.docs = {
                exists: true,
                path: docsPath,
                hasModules: fs.existsSync(path.join(docsPath, 'modules')),
                hasSymbols: fs.existsSync(path.join(docsPath, 'index', 'symbols.jsonl')),
                hasDependencies: fs.existsSync(path.join(docsPath, 'system', 'DEPENDENCY_GRAPH.md')),
                hasAdrs: fs.existsSync(path.join(docsPath, 'adr')),
                hasChanges: fs.existsSync(path.join(docsPath, 'system', 'CHANGE_REPORT.md'))
            };
        }

        // Check SQLite databases
        const dbPath = path.join(this.workspaceRoot, '.database-plugin');
        if (fs.existsSync(dbPath)) {
            status.databases = {
                exists: true,
                path: dbPath,
                hasModules: fs.existsSync(path.join(dbPath, 'modules.db')),
                hasSymbols: fs.existsSync(path.join(dbPath, 'symbols.db')),
                hasDependencies: fs.existsSync(path.join(dbPath, 'dependencies.db')),
                hasAdrs: fs.existsSync(path.join(dbPath, 'adrs.db')),
                hasChanges: fs.existsSync(path.join(dbPath, 'changes.db'))
            };
        }

        // Check embeddings
        const embeddingPath = path.join(dbPath, 'vectors.db');
        if (fs.existsSync(embeddingPath)) {
            status.embeddings = {
                exists: true,
                path: embeddingPath
            };
        }

        // Check plugin ID consistency (critical for foreign systems)
        if (status.databases?.exists === true) {
            const pluginIdInfo = await this.verifyPluginId(resolvedPluginId, dbPath);
            status.pluginId = pluginIdInfo;
        }

        // Check plugins
        // Align with adapter resolution: workspaceRoot, parent, cwd, and node_modules resolve fallback.
        const findPluginPath = (dirName: '5d-database-plugin' | 'documentation-system-plugin'): string | undefined => {
            const candidates = [
                path.join(this.workspaceRoot, dirName),
                path.join(this.workspaceRoot, '..', dirName),
                path.join(process.cwd(), dirName)
            ];

            for (const candidate of candidates) {
                if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'package.json'))) {
                    return candidate;
                }
            }

            return undefined;
        };

        const resolveFromNodeModules = (pkgName: string): string | undefined => {
            const pkgDirFromFsUpwards = (maxDepth: number = 6): string | undefined => {
                let currentDir = path.resolve(this.workspaceRoot);
                for (let depth = 0; depth <= maxDepth; depth++) {
                    const candidate = path.join(
                        currentDir,
                        'node_modules',
                        ...pkgName.split('/'),
                        'package.json'
                    );
                    if (fs.existsSync(candidate)) {
                        return path.dirname(candidate);
                    }
                    const parent = path.dirname(currentDir);
                    if (parent === currentDir) {
                        break;
                    }
                    currentDir = parent;
                }
                return undefined;
            };

            const fromFs = pkgDirFromFsUpwards();
            if (fromFs) {
                return fromFs;
            }

            try {
                const require = createRequire(import.meta.url);
                // Prefer resolving relative to the intended workspace/cwd (foreign systems may start the server elsewhere)
                try {
                    const pkgJsonPath = require.resolve(`${pkgName}/package.json`, {
                        paths: [this.workspaceRoot, process.cwd()]
                    });
                    return path.dirname(pkgJsonPath);
                } catch {
                    // ignore and try default resolution
                }

                const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
                return path.dirname(pkgJsonPath);
            } catch {
                return undefined;
            }
        };

        const databasePluginPath =
            findPluginPath('5d-database-plugin') ??
            resolveFromNodeModules('@noyrax/5d-database-plugin');

        const documentationPluginPath =
            findPluginPath('documentation-system-plugin') ??
            resolveFromNodeModules('@noyrax/documentation-system-plugin');

        // Check availability with multiple fallbacks
        const databasePluginAvailable =
            typeof databasePluginPath === 'string' &&
            (fs.existsSync(path.join(databasePluginPath, 'out', 'api')) ||
             fs.existsSync(path.join(databasePluginPath, 'out', 'core', 'multi-db-manager.js')));

        const documentationPluginAvailable =
            typeof documentationPluginPath === 'string' &&
            fs.existsSync(path.join(documentationPluginPath, 'out', 'cli'));

        // Get detailed info for database plugin
        let databasePluginDetails: any = { exists: false, available: false };
        if (databasePluginPath) {
            const hasOutApi = fs.existsSync(path.join(databasePluginPath, 'out', 'api'));
            const hasOutCore = fs.existsSync(path.join(databasePluginPath, 'out', 'core', 'multi-db-manager.js'));
            const hasPackageJson = fs.existsSync(path.join(databasePluginPath, 'package.json'));
            
            databasePluginDetails = {
                exists: true,
                path: databasePluginPath,
                available: databasePluginAvailable,
                expected: 'out/api or out/core/multi-db-manager.js',
                hasOutApi,
                hasOutCore,
                hasPackageJson,
                resolvedFrom: databasePluginPath.includes('node_modules') ? 'node_modules' : 
                             databasePluginPath.includes(this.workspaceRoot) ? 'workspace' : 'other'
            };
        }

        status.plugins = {
            databasePlugin: databasePluginDetails,
            documentationPlugin: documentationPluginPath
                ? {
                    exists: true,
                    path: documentationPluginPath,
                    available: documentationPluginAvailable,
                    expected: 'out/cli (compile required)'
                }
                : { exists: false, available: false }
        };

        // Actionable guidance (deterministic, no timestamps)
        const docsComplete =
            status.docs?.exists === true &&
            status.docs?.hasModules === true &&
            status.docs?.hasSymbols === true &&
            status.docs?.hasDependencies === true &&
            status.docs?.hasAdrs === true &&
            status.docs?.hasChanges === true;

        const databasesComplete =
            status.databases?.exists === true &&
            status.databases?.hasModules === true &&
            status.databases?.hasSymbols === true &&
            status.databases?.hasDependencies === true &&
            status.databases?.hasAdrs === true &&
            status.databases?.hasChanges === true;

        status.readiness = {
            docsComplete,
            databasesComplete,
            embeddingsPresent: status.embeddings?.exists === true,
            pluginsAvailable: {
                databasePlugin: status.plugins?.databasePlugin?.available === true,
                documentationPlugin: status.plugins?.documentationPlugin?.available === true
            }
        };

        const missingDocsParts: string[] = [];
        if (status.docs?.exists === true) {
            if (status.docs?.hasModules !== true) missingDocsParts.push('docs/modules');
            if (status.docs?.hasSymbols !== true) missingDocsParts.push('docs/index/symbols.jsonl');
            if (status.docs?.hasDependencies !== true) missingDocsParts.push('docs/system/DEPENDENCY_GRAPH.md');
            if (status.docs?.hasAdrs !== true) missingDocsParts.push('docs/adr');
            if (status.docs?.hasChanges !== true) missingDocsParts.push('docs/system/CHANGE_REPORT.md');
        }

        const missingDbParts: string[] = [];
        if (status.databases?.exists === true) {
            if (status.databases?.hasModules !== true) missingDbParts.push('.database-plugin/modules.db');
            if (status.databases?.hasSymbols !== true) missingDbParts.push('.database-plugin/symbols.db');
            if (status.databases?.hasDependencies !== true) missingDbParts.push('.database-plugin/dependencies.db');
            if (status.databases?.hasAdrs !== true) missingDbParts.push('.database-plugin/adrs.db');
            if (status.databases?.hasChanges !== true) missingDbParts.push('.database-plugin/changes.db');
        }

        const docsRoot = status.docs?.path ? path.dirname(status.docs.path) : null;
        const workspaceRootMismatch =
            typeof docsRoot === 'string' && path.resolve(docsRoot) !== path.resolve(this.workspaceRoot);

        status.workspace = {
            workspaceRoot: this.workspaceRoot,
            docsRoot: docsRoot,
            workspaceRootMatchesDocsRoot: workspaceRootMismatch ? false : docsRoot ? true : null
        };

        const blockingIssues: Array<{
            code: string;
            severity: 'blocking' | 'warning';
            message: string;
            details?: any;
        }> = [];

        if (status.plugins?.databasePlugin?.exists !== true) {
            blockingIssues.push({
                code: 'DATABASE_PLUGIN_NOT_AVAILABLE',
                severity: 'blocking',
                message: '5D Database Plugin is not installed in this workspace (required for database tools, ingestion, and most workflows).'
            });
        } else if (status.plugins?.databasePlugin?.available !== true) {
            blockingIssues.push({
                code: 'DATABASE_PLUGIN_NOT_COMPILED',
                severity: 'blocking',
                message: '5D Database Plugin is present but not compiled (missing out/api).',
                details: {
                    hint: 'Compile it: cd 5d-database-plugin && npm run compile (or npm run compile:all in the workspace root).'
                }
            });
        }

        if (status.plugins?.documentationPlugin?.exists !== true) {
            blockingIssues.push({
                code: 'DOCUMENTATION_PLUGIN_NOT_AVAILABLE',
                severity: 'warning',
                message: 'Documentation System Plugin is not installed (required for scan/validate/verify and for regenerating docs/).'
            });
        } else if (status.plugins?.documentationPlugin?.available !== true) {
            blockingIssues.push({
                code: 'DOCUMENTATION_PLUGIN_NOT_COMPILED',
                severity: 'warning',
                message: 'Documentation System Plugin is present but not compiled (missing out/cli).',
                details: {
                    hint: 'Compile it: cd documentation-system-plugin && npm run compile (or npm run compile:all in the workspace root).'
                }
            });
        }

        if (status.docs?.exists !== true) {
            blockingIssues.push({
                code: 'DOCS_NOT_FOUND',
                severity: 'blocking',
                message: 'docs/ directory not found. Generate documentation first.',
                details: {
                    expected: 'docs/',
                    hint: 'Run workflow/generate_and_ingest (or generate_documentation) to create docs/.'
                }
            });
        } else if (!docsComplete) {
            blockingIssues.push({
                code: 'DOCS_INCOMPLETE',
                severity: 'blocking',
                message: 'docs/ exists but is missing required files/directories.',
                details: { missing: missingDocsParts.sort() }
            });
        }

        if (status.databases?.exists !== true) {
            blockingIssues.push({
                code: 'DATABASES_NOT_FOUND',
                severity: 'blocking',
                message: 'SQLite databases not found. Run ingestion to create .database-plugin/*.db.',
                details: {
                    expected: '.database-plugin/',
                    hint: 'Run workflow/generate_and_ingest (or workflow/ingest if docs/ already exists).'
                }
            });
        } else if (!databasesComplete) {
            blockingIssues.push({
                code: 'DATABASES_INCOMPLETE',
                severity: 'blocking',
                message: 'SQLite databases exist but are missing required DB files.',
                details: { missing: missingDbParts.sort() }
            });
        }

        if (workspaceRootMismatch) {
            blockingIssues.push({
                code: 'WORKSPACE_ROOT_MISMATCH',
                severity: 'warning',
                message: 'docs/ was found in a parent directory. Ensure you started the MCP server with the correct workspace root (the parent of docs/).',
                details: {
                    providedWorkspaceRoot: this.workspaceRoot,
                    detectedDocsRoot: docsRoot
                }
            });
        }

        // Embeddings are OPTIONAL for basic navigation, but improve semantic search quality.
        const embeddingGuidance = {
            optional: true,
            present: status.embeddings?.exists === true,
            message:
                status.embeddings?.exists === true
                    ? 'Embeddings database file exists (semantic search should be available).'
                    : 'Embeddings database file not found. Semantic search may be unavailable or degraded until embeddings are generated.',
            hints: [
                'Ensure OPENAI_API_KEY is set (commonly via a .env file in the workspace root).',
                'On Windows, Semantic Brain may use ChromaDB; see CHROMADB_SETUP.md in the 5d-database-plugin for setup.'
            ],
            env: {
                hasOpenAIKey: typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0,
                hasAnthropicKey: typeof process.env.ANTHROPIC_API_KEY === 'string' && process.env.ANTHROPIC_API_KEY.length > 0,
                hasOpenAIModel: typeof process.env.OPENAI_MODEL === 'string' && process.env.OPENAI_MODEL.length > 0,
                hasAnthropicModel: typeof process.env.ANTHROPIC_MODEL === 'string' && process.env.ANTHROPIC_MODEL.length > 0
            }
        };

        const nextSteps: Array<{ name: string; arguments?: any; description: string }> = [];

        // Deterministic ordering: fix readiness first, then onboarding usage.
        const needsDocsOrDb = !docsComplete || !databasesComplete;
        if (needsDocsOrDb) {
            if (status.plugins?.databasePlugin?.available === true && status.plugins?.documentationPlugin?.available === true) {
                nextSteps.push({
                    name: 'workflow/generate_and_ingest',
                    arguments: { pluginId: resolvedPluginId },
                    description: 'Generate docs/ and ingest into SQLite databases (best first fix when docs/ or DBs are missing/incomplete).'
                });
            } else if (status.plugins?.databasePlugin?.available === true && docsComplete === true) {
                nextSteps.push({
                    name: 'workflow/ingest',
                    arguments: { pluginId: resolvedPluginId, full: true },
                    description: 'Ingest docs/ into SQLite databases (docs/ seems present; fixes missing databases).'
                });
            }

            // Always offer ensure_ready as a best-effort guided fix.
            nextSteps.push({
                name: 'workflow/ensure_ready',
                arguments: { pluginId: resolvedPluginId },
                description: 'Best-effort: check status and automatically run the minimal required workflow steps to make the system ready.'
            });
        } else {
            nextSteps.push({
                name: 'system_explanation',
                arguments: { pluginId: resolvedPluginId },
                description: 'Get the deterministic system overview and entry points.'
            });
        }

        // Always suggest semantic_discovery as a next usage step (may be limited without embeddings).
        nextSteps.push({
            name: 'semantic_discovery',
            arguments: { pluginId: resolvedPluginId, query: 'main entry point', limit: 5 },
            description: 'Find key files by meaning (e.g., entry points, authentication, database).'
        });

        status.blockingIssues = blockingIssues.sort((a, b) => a.code.localeCompare(b.code));
        status.nextSteps = nextSteps;
        status.embeddingGuidance = embeddingGuidance;
        status.summary = (() => {
            const parts: string[] = [];
            parts.push(`docs: ${docsComplete ? 'ready' : (status.docs?.exists ? 'incomplete' : 'missing')}`);
            parts.push(`databases: ${databasesComplete ? 'ready' : (status.databases?.exists ? 'incomplete' : 'missing')}`);
            parts.push(`embeddings: ${status.embeddings?.exists ? 'present (optional)' : 'missing (optional)'}`);
            const pluginOk =
                status.plugins?.databasePlugin?.available === true &&
                status.plugins?.documentationPlugin?.available === true;
            parts.push(`plugins: ${pluginOk ? 'compiled' : 'missing/needs-compile'}`);
            return parts.join(', ');
        })();

        return status;
    }

    /**
     * Ensure the system is ready for onboarding and usage.
     *
     * Best-effort behavior (deterministic):
     * - Always runs check_status first
     * - If docs/ are missing/incomplete, attempts to generate docs/ (requires documentation-system-plugin compiled)
     * - If databases are missing/incomplete, attempts ingestion
     * - Embeddings are OPTIONAL and are not generated here (guidance only)
     */
    public async ensureReady(args: { pluginId?: string }): Promise<any> {
        const steps: any[] = [];
        const errors: string[] = [];

        const pluginId = this.resolvePluginId(args.pluginId);

        // Step 1: Status
        steps.push({ step: 'check_status', status: 'running' });
        let status1: any | undefined;
        try {
            status1 = await this.checkStatus(pluginId);
            steps[steps.length - 1] = { step: 'check_status', status: 'completed', result: status1 };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`check_status failed: ${msg}`);
            steps[steps.length - 1] = { step: 'check_status', status: 'failed', error: msg };
        }

        const workspaceRootMismatch = status1?.workspace?.workspaceRootMatchesDocsRoot === false;
        if (workspaceRootMismatch) {
            errors.push(
                'Workspace root mismatch: docs/ was found in a different directory than the provided workspace root. Start the MCP server at the parent of docs/ to avoid writing DBs into the wrong place.'
            );
        }

        const dbPluginAvailable = status1?.plugins?.databasePlugin?.available === true;
        if (!dbPluginAvailable) {
            errors.push('5D Database Plugin is not available/compiled (required for ingestion and onboarding workflows).');
        }

        // If we cannot safely proceed, return early after best-effort diagnostics.
        if (!status1 || workspaceRootMismatch || !dbPluginAvailable) {
            return {
                status: errors.length > 0 ? 'completed_with_errors' : 'completed',
                ready: false,
                steps,
                errors: errors.length > 0 ? errors : undefined,
                guidance: status1?.nextSteps ?? []
            };
        }

        const docsComplete = status1?.readiness?.docsComplete === true;
        const databasesComplete = status1?.readiness?.databasesComplete === true;
        const docPluginAvailable = status1?.plugins?.documentationPlugin?.available === true;
        let docsGenerated = false;

        // Step 2: Fix docs (if needed)
        if (!docsComplete) {
            steps.push({ step: 'generate_documentation', status: 'running' });
            if (docPluginAvailable !== true) {
                const msg = 'Cannot generate docs/: Documentation System Plugin is missing or not compiled (out/cli).';
                errors.push(msg);
                steps[steps.length - 1] = { step: 'generate_documentation', status: 'failed', error: msg };
            } else {
                try {
                    const generateResult = await this.validationTools.runGenerate({ full: true });
                    steps[steps.length - 1] = { step: 'generate_documentation', status: 'completed', result: generateResult };
                    docsGenerated = true;
                } catch (error: any) {
                    const msg = error?.message || String(error);
                    errors.push(`generate_documentation failed: ${msg}`);
                    steps[steps.length - 1] = { step: 'generate_documentation', status: 'failed', error: msg };
                }
            }
        }

        // Step 3: Fix databases (if needed)
        // If docs were generated, ALWAYS re-ingest to keep DBs in sync with docs/.
        if (docsGenerated || !databasesComplete) {
            steps.push({ step: 'ingest', status: 'running', full: true });
            try {
                const ingestResult = await this.databaseTools.runIngestion(pluginId, true);
                steps[steps.length - 1] = { step: 'ingest', status: 'completed', result: ingestResult };
            } catch (error: any) {
                const msg = error?.message || String(error);
                errors.push(`ingest failed: ${msg}`);
                steps[steps.length - 1] = { step: 'ingest', status: 'failed', error: msg };
            }
        }

        // Step 4: Re-check
        steps.push({ step: 'check_status', status: 'running', phase: 'after_fix' });
        let status2: any | undefined;
        try {
            status2 = await this.checkStatus(pluginId);
            steps[steps.length - 1] = { step: 'check_status', status: 'completed', phase: 'after_fix', result: status2 };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`check_status (after_fix) failed: ${msg}`);
            steps[steps.length - 1] = { step: 'check_status', status: 'failed', phase: 'after_fix', error: msg };
        }

        const ready =
            status2?.plugins?.databasePlugin?.available === true &&
            status2?.readiness?.docsComplete === true &&
            status2?.readiness?.databasesComplete === true;

        return {
            status: errors.length > 0 ? 'completed_with_errors' : 'completed',
            ready,
            summary: status2?.summary ?? status1?.summary,
            blockingIssues: status2?.blockingIssues ?? status1?.blockingIssues,
            nextSteps: status2?.nextSteps ?? status1?.nextSteps,
            steps,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    /**
     * Onboard workflow for a foreign codebase.
     *
     * Produces a deterministic, copy/paste friendly report (Markdown) plus structured JSON.
     * No AI generation: everything is tool-/database-driven.
     */
    public async onboard(args: {
        pluginId?: string;
        ensureReady?: boolean;
        semanticQueries?: string[];
        semanticLimit?: number;
        gapMinDependencies?: number;
        gapLimit?: number;
        summaryOnly?: boolean; // If true, returns only summary without full details
        excludeMarkdown?: boolean; // If true, excludes reportMarkdown
        excludeSteps?: boolean; // If true, excludes detailed steps
    }): Promise<any> {
        const steps: any[] = [];
        const errors: string[] = [];

        const pluginId = this.resolvePluginId(args.pluginId);
        const ensureReady = args.ensureReady !== false; // default true
        const semanticLimit = typeof args.semanticLimit === 'number' ? args.semanticLimit : 5;
        const gapMinDependencies = typeof args.gapMinDependencies === 'number' ? args.gapMinDependencies : 5;
        const gapLimit = typeof args.gapLimit === 'number' ? args.gapLimit : 20;
        const summaryOnly = args.summaryOnly === true; // default false
        const excludeMarkdown = args.excludeMarkdown === true; // default false
        const excludeSteps = args.excludeSteps === true; // default false

        const semanticQueriesRaw = Array.isArray(args.semanticQueries) ? args.semanticQueries : [
            'main entry point',
            'authentication',
            'database'
        ];
        const semanticQueries = semanticQueriesRaw
            .map(q => String(q || '').trim())
            .filter(q => q.length > 0)
            .slice(0, 5); // keep bounded/deterministic

        // Helper: stable unique-sort
        const uniqueSorted = (items: string[]): string[] => {
            const set = new Set(items.filter(Boolean));
            return Array.from(set).sort((a, b) => a.localeCompare(b));
        };

        // Step 0: Ensure ready (optional)
        let ensureReadyResult: any | undefined;
        if (ensureReady) {
            steps.push({ step: 'ensure_ready', status: 'running' });
            try {
                ensureReadyResult = await this.ensureReady({ pluginId });
                steps[steps.length - 1] = { step: 'ensure_ready', status: 'completed', result: ensureReadyResult };
            } catch (error: any) {
                const msg = error?.message || String(error);
                errors.push(`ensure_ready failed: ${msg}`);
                steps[steps.length - 1] = { step: 'ensure_ready', status: 'failed', error: msg };
            }
        }

        // Always collect current status (for the report)
        steps.push({ step: 'check_status', status: 'running' });
        let status: any | undefined;
        try {
            status = await this.checkStatus(pluginId);
            steps[steps.length - 1] = { step: 'check_status', status: 'completed', result: status };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`check_status failed: ${msg}`);
            steps[steps.length - 1] = { step: 'check_status', status: 'failed', error: msg };
        }

        const ready =
            status?.plugins?.databasePlugin?.available === true &&
            status?.readiness?.docsComplete === true &&
            status?.readiness?.databasesComplete === true;

        // Step 1: System explanation (entry points, ADRs, stats) — best effort
        let systemExplanationParsed: any | undefined;
        steps.push({ step: 'system_explanation', status: 'running' });
        try {
            const explanationRaw = await this.databaseTools.systemExplanation(pluginId);
            systemExplanationParsed = explanationRaw;
            steps[steps.length - 1] = { step: 'system_explanation', status: 'completed', result: systemExplanationParsed };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`system_explanation failed: ${msg}`);
            steps[steps.length - 1] = { step: 'system_explanation', status: 'failed', error: msg };
        }

        // Step 2: Change summary (latest run metadata) — best effort
        let changeSummary: any | undefined;
        steps.push({ step: 'query_changes', status: 'running' });
        try {
            const changeReport = await this.databaseTools.queryChanges(pluginId);
            // Determinism/UX: omit timestamps from the report
            if (changeReport) {
                changeSummary = {
                    run_type: changeReport.run_type,
                    parsed_files: changeReport.parsed_files,
                    skipped_files: changeReport.skipped_files,
                    total_dependencies: changeReport.total_dependencies,
                    validation_errors: changeReport.validation_errors,
                    validation_warnings: changeReport.validation_warnings
                };
            } else {
                changeSummary = null;
            }
            steps[steps.length - 1] = { step: 'query_changes', status: 'completed', result: changeSummary };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`query_changes failed: ${msg}`);
            steps[steps.length - 1] = { step: 'query_changes', status: 'failed', error: msg };
        }

        // Step 3: Gap analysis (hotspots) — best effort
        let gapAnalysisParsed: any | undefined;
        steps.push({ step: 'gap_analysis', status: 'running', minDependencies: gapMinDependencies, limit: gapLimit });
        try {
            const gapRaw = await this.databaseTools.gapAnalysis({
                pluginId,
                minDependencies: gapMinDependencies,
                limit: gapLimit,
                autoGenerateAdrs: false
            });
            // gapRaw ist bereits ein Objekt, nicht parsen
            gapAnalysisParsed = gapRaw;
            // Determinism: remove runtime timestamps
            if (gapAnalysisParsed?.summary?.analysis_date) {
                delete gapAnalysisParsed.summary.analysis_date;
            }
            steps[steps.length - 1] = { step: 'gap_analysis', status: 'completed', result: gapAnalysisParsed };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`gap_analysis failed: ${msg}`);
            steps[steps.length - 1] = { step: 'gap_analysis', status: 'failed', error: msg };
        }

        // Step 4: Semantic discovery for common topics — best effort
        const semanticDiscoveryResults: Array<{
            query: string;
            ok: boolean;
            topExternalIds?: string[];
            error?: string;
        }> = [];

        for (const query of semanticQueries) {
            steps.push({ step: 'semantic_discovery', status: 'running', query, limit: semanticLimit });
            try {
                const discoveryRaw = await this.databaseTools.semanticDiscovery({ query, pluginId, limit: semanticLimit });
                // discoveryRaw ist bereits ein Objekt, nicht parsen
                const parsed = discoveryRaw;
                const topExternalIds = Array.isArray(parsed?.results)
                    ? parsed.results
                        .map((r: any) => String(r?.externalId || '').trim())
                        .filter((v: string) => v.length > 0)
                        .slice(0, semanticLimit)
                    : [];

                semanticDiscoveryResults.push({
                    query,
                    ok: true,
                    topExternalIds: uniqueSorted(topExternalIds)
                });
                steps[steps.length - 1] = {
                    step: 'semantic_discovery',
                    status: 'completed',
                    query,
                    result: { query, topExternalIds }
                };
            } catch (error: any) {
                const msg = error?.message || String(error);
                semanticDiscoveryResults.push({ query, ok: false, error: msg });
                errors.push(`semantic_discovery failed for "${query}": ${msg}`);
                steps[steps.length - 1] = { step: 'semantic_discovery', status: 'failed', query, error: msg };
            }
        }

        // Recommended next queries: entry points + top gap hotspots (unique, deterministic order)
        const candidateFilePaths: Array<{ filePath: string; reason: string }> = [];

        const entryPoints: string[] = Array.isArray(systemExplanationParsed?.entry_points)
            ? systemExplanationParsed.entry_points
                .map((ep: any) => String(ep?.external_id || '').trim())
                .filter((p: string) => p.length > 0)
            : [];

        for (const p of entryPoints.slice(0, 5)) {
            candidateFilePaths.push({ filePath: p, reason: 'entry_point' });
        }

        const gapsWithoutAdrs: any[] = Array.isArray(gapAnalysisParsed?.gaps?.without_adrs)
            ? gapAnalysisParsed.gaps.without_adrs
            : [];
        for (const gap of gapsWithoutAdrs.slice(0, 5)) {
            const p = String(gap?.module?.file_path || '').trim();
            if (p) {
                candidateFilePaths.push({ filePath: p, reason: 'doc_gap' });
            }
        }

        const recommendedNextQueries = uniqueSorted(candidateFilePaths.map(c => c.filePath))
            .slice(0, 10)
            .map(filePath => ({
                name: 'cross_analysis',
                arguments: { filePath, pluginId },
                description: 'Get combined ADR + symbol context for this file.'
            }));

        // Build reportMarkdown (deterministic, no timestamps) - only if not excluded
        let reportMarkdown: string | undefined;
        if (!excludeMarkdown) {
            const lines: string[] = [];
            lines.push('# Onboarding Report');
            lines.push('');
            lines.push('## Readiness');
            lines.push(`- Summary: ${status?.summary ?? 'unknown'}`);
            lines.push(`- ReadyForOnboarding: ${ready ? 'yes' : 'no'}`);
            if (Array.isArray(status?.blockingIssues) && status.blockingIssues.length > 0) {
                lines.push('- Issues:');
                for (const issue of status.blockingIssues) {
                    const code = String(issue?.code || '').trim();
                    const sev = String(issue?.severity || '').trim();
                    const msg = String(issue?.message || '').trim();
                    if (code && sev && msg) {
                        lines.push(`  - ${code} (${sev}): ${msg}`);
                    }
                }
            }
            lines.push('');

            lines.push('## Systemkarte');
            const dims = Array.isArray(systemExplanationParsed?.dimensions) ? systemExplanationParsed.dimensions : [];
            if (dims.length > 0) {
                lines.push('- Dimensionen (Counts):');
                for (const d of dims) {
                    const id = String(d?.id || '').trim();
                    const name = String(d?.name || '').trim();
                    const count = typeof d?.entity_count === 'number' ? d.entity_count : undefined;
                    if (id && name) {
                        lines.push(`  - ${id}: ${name}${typeof count === 'number' ? ` (${count})` : ''}`);
                    }
                }
            }

            const archAdrs = Array.isArray(systemExplanationParsed?.architecture_adrs)
                ? systemExplanationParsed.architecture_adrs
                : [];
            if (archAdrs.length > 0) {
                lines.push('- Architektur-ADRs:');
                for (const adr of archAdrs.slice(0, 10)) {
                    const num = String(adr?.adr_number || '').trim();
                    const title = String(adr?.title || '').trim();
                    if (num && title) {
                        lines.push(`  - ${num}: ${title}`);
                    }
                }
            }

            if (entryPoints.length > 0) {
                lines.push('- Entry Points:');
                for (const p of uniqueSorted(entryPoints).slice(0, 10)) {
                    lines.push(`  - ${p}`);
                }
            }
            lines.push('');

            lines.push('## Hotspots (Doku-Gaps)');
            if (gapsWithoutAdrs.length > 0) {
                for (const gap of gapsWithoutAdrs.slice(0, 10)) {
                    const p = String(gap?.module?.file_path || '').trim();
                    const deps = typeof gap?.dependency_count === 'number' ? gap.dependency_count : undefined;
                    const score = typeof gap?.gap_score === 'number' ? gap.gap_score : undefined;
                    if (p) {
                        lines.push(`- ${p}${typeof deps === 'number' ? ` (deps: ${deps})` : ''}${typeof score === 'number' ? ` (gap: ${score})` : ''}`);
                    }
                }
            } else {
                lines.push('- (keine Daten oder keine Gaps gefunden)');
            }
            lines.push('');

            lines.push('## Änderungen (letzter Report)');
            if (changeSummary === null) {
                lines.push('- (kein Change-Report gefunden)');
            } else if (changeSummary) {
                const keys = ['run_type', 'parsed_files', 'skipped_files', 'total_dependencies', 'validation_errors', 'validation_warnings'] as const;
                for (const k of keys) {
                    if (typeof changeSummary[k] !== 'undefined') {
                        lines.push(`- ${k}: ${changeSummary[k]}`);
                    }
                }
            } else {
                lines.push('- (nicht verfügbar)');
            }
            lines.push('');

            lines.push('## Next Steps (Tools)');
            for (const step of (status?.nextSteps ?? [])) {
                const name = String(step?.name || '').trim();
                const desc = String(step?.description || '').trim();
                if (name && desc) {
                    lines.push(`- ${name}: ${desc}`);
                }
            }
            lines.push('');

            lines.push('## Empfohlene Kontext-Abfragen');
            for (const q of recommendedNextQueries) {
                lines.push(`- cross_analysis: ${q.arguments.filePath}`);
            }
            lines.push('');

            reportMarkdown = lines.join('\n');
        }

        // Build compact summary if requested
        const summary = summaryOnly ? {
            ready,
            statusSummary: status?.summary ?? null,
            blockingIssuesCount: Array.isArray(status?.blockingIssues) ? status.blockingIssues.length : 0,
            dimensionsCount: Array.isArray(systemExplanationParsed?.dimensions) ? systemExplanationParsed.dimensions.length : 0,
            architectureAdrsCount: Array.isArray(systemExplanationParsed?.architecture_adrs) ? systemExplanationParsed.architecture_adrs.length : 0,
            entryPointsCount: Array.isArray(systemExplanationParsed?.entry_points) ? systemExplanationParsed.entry_points.length : 0,
            gapAnalysisCount: Array.isArray(gapAnalysisParsed?.gaps?.without_adrs) ? gapAnalysisParsed.gaps.without_adrs.length : 0,
            semanticDiscoveryCount: semanticDiscoveryResults.length,
            recommendedNextQueriesCount: recommendedNextQueries.length
        } : undefined;

        // Build full reportJson only if not summaryOnly
        const reportJson = summaryOnly ? undefined : {
            ready,
            statusSummary: status?.summary ?? null,
            blockingIssues: status?.blockingIssues ?? [],
            readiness: status?.readiness ?? null,
            workspace: status?.workspace ?? null,
            systemExplanation: systemExplanationParsed ?? null,
            changeSummary: changeSummary ?? null,
            gapAnalysis: gapAnalysisParsed ?? null,
            semanticDiscovery: semanticDiscoveryResults,
            recommendedNextQueries
        };

        return {
            status: errors.length > 0 ? 'completed_with_errors' : 'completed',
            ready,
            ...(excludeMarkdown ? {} : { reportMarkdown }),
            ...(summaryOnly ? { summary } : { reportJson }),
            recommendedNextQueries: summaryOnly ? recommendedNextQueries.slice(0, 5) : recommendedNextQueries, // Limit if summary
            ...(excludeSteps ? {} : { steps }),
            errors: errors.length > 0 ? errors : undefined,
            ensureReady: ensureReady && !summaryOnly ? ensureReadyResult : undefined
        };
    }

    /**
     * Generate onboarding report (refs-first).
     * 
     * @param args Arguments (pluginId, mode, reportType)
     * @returns Onboarding report (refs-first)
     */
    public async onboardingReport(args: {
        pluginId?: string;
        mode?: 'refs' | 'full';
        reportType?: 'summary' | 'full';
    }): Promise<any> {
        const resolvedPluginId = this.resolvePluginId(args.pluginId);
        const mode = args.mode || 'refs';
        const reportType = args.reportType || 'summary';
        
        // Generate report using onboard (as projection)
        const onboardResult = await this.onboard({
            pluginId: resolvedPluginId,
            ensureReady: false, // Don't ensure ready for refs mode
            summaryOnly: reportType === 'summary',
            excludeMarkdown: mode === 'refs', // Exclude markdown in refs mode
            excludeSteps: mode === 'refs' // Exclude steps in refs mode
        });
        
        // Compute artifact ID and checksum
        const reportJson = JSON.stringify(onboardResult);
        const checksum = crypto.createHash('sha256').update(reportJson).digest('hex').substring(0, 16);
        const artifactId = crypto.createHash('sha256')
            .update(`${resolvedPluginId}:onboarding_report:${reportType}:${checksum}`)
            .digest('hex')
            .substring(0, 16);
        
        // Create evidence sources (compatible with EvidenceSource interface)
        const evidenceSources: Array<{
            type: 'ADR' | 'MODULE' | 'SYMBOL' | 'DEPENDENCY' | 'DB_QUERY' | 'STATUS_CHECK' | 'CONTRACT';
            id?: string;
            path?: string;
            hash?: string;
            metadata?: Record<string, any>;
        }> = [
            {
                type: 'STATUS_CHECK',
                hash: checksum
            }
        ];
        
        // Add dimension sources if systemExplanation is available - use DB_QUERY for dimensions
        if (onboardResult.reportJson?.systemExplanation) {
            const dims = onboardResult.reportJson.systemExplanation.dimensions || [];
            for (const dim of dims) {
                evidenceSources.push({
                    type: 'DB_QUERY',
                    id: dim.id,
                    metadata: { dimension: dim.id }
                });
            }
        }
        
        // Create evidence (INFERRED from multiple sources)
        const evidence = {
            grade: 'INFERRED' as const,
            sources: evidenceSources,
            description: 'Onboarding report derived from system status, system explanation, gap analysis, and semantic discovery'
        };
        
        // Default: refs mode - return only reference
        if (mode === 'refs') {
            // Build preview
            const preview = {
                ready: onboardResult.ready,
                status_summary: onboardResult.summary?.statusSummary || onboardResult.reportJson?.statusSummary || null,
                blocking_issues_count: onboardResult.summary?.blockingIssuesCount || onboardResult.reportJson?.blockingIssues?.length || 0,
                dimensions_count: onboardResult.summary?.dimensionsCount || onboardResult.reportJson?.systemExplanation?.dimensions?.length || 0,
                recommended_queries_count: onboardResult.summary?.recommendedNextQueriesCount || onboardResult.recommendedNextQueries?.length || 0
            };
            
            return {
                artifact_id: artifactId,
                artifact_type: 'onboarding_report',
                report_type: reportType,
                generated_at: new Date().toISOString(),
                checksum,
                evidence,
                preview
            };
        }
        
        // Full mode: return complete report (gated, kein Markdown standardmäßig)
        if (mode === 'full') {
            // Enforce max size (approximate)
            const reportSize = reportJson.length;
            const maxSize = 2000000; // 2MB limit
            if (reportSize > maxSize) {
                throw new Error(`Report size (${reportSize} bytes) exceeds maximum (${maxSize} bytes). Use reportType="summary" for smaller output.`);
            }
            
            return {
                artifact_id: artifactId,
                artifact_type: 'onboarding_report',
                report_type: reportType,
                generated_at: new Date().toISOString(),
                checksum,
                evidence,
                report: onboardResult.reportJson || onboardResult.summary,
                recommendedNextQueries: onboardResult.recommendedNextQueries
            };
        }
        
        return {
            artifact_id: artifactId,
            artifact_type: 'onboarding_report',
            report_type: reportType,
            generated_at: new Date().toISOString(),
            checksum,
            evidence
        };
    }

    /**
     * Autonomous feature workflow (Phase 3 / Autonomy).
     *
     * This tool is intentionally deterministic and tool-driven:
     * - Collects system context via existing MCP/database tools
     * - Returns a structured plan + gathered context
     * - Does NOT modify code directly (implementation remains the AI-agent's responsibility)
     */
    public async autonomousFeature(args: {
        pluginId: string;
        requirement: string;
        limit?: number;
        candidateFiles?: string[];
        ensureReady?: boolean;
    }): Promise<any> {
        const steps: any[] = [];
        const errors: string[] = [];

        const limit = args.limit ?? 5;
        const candidateFiles = (args.candidateFiles ?? []).slice(0, 10);

        // Step 1: Status
        steps.push({ step: 'check_status', status: 'running' });
        let systemStatus: any | undefined;
        try {
            systemStatus = await this.checkStatus(args.pluginId);
            steps[steps.length - 1] = { step: 'check_status', status: 'completed', result: systemStatus };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`check_status failed: ${msg}`);
            steps[steps.length - 1] = { step: 'check_status', status: 'failed', error: msg };
        }

        // Optional: ensure docs/ + DBs exist (best-effort)
        if (args.ensureReady === true && systemStatus) {
            const needsDocs = systemStatus.docs?.exists !== true;
            const needsDb = systemStatus.databases?.exists !== true;
            if (needsDocs || needsDb) {
                steps.push({ step: 'generate_and_ingest', status: 'running', reason: 'ensureReady=true and docs/ or databases missing' });
                try {
                    const generateAndIngestResult = await this.generateAndIngest(args.pluginId);
                    steps[steps.length - 1] = { step: 'generate_and_ingest', status: 'completed', result: generateAndIngestResult };
                } catch (error: any) {
                    const msg = error?.message || String(error);
                    errors.push(`generate_and_ingest failed: ${msg}`);
                    steps[steps.length - 1] = { step: 'generate_and_ingest', status: 'failed', error: msg };
                }
            }
        }

        // Step 2: Bootstrap
        steps.push({ step: 'bootstrap', status: 'running' });
        try {
            const bootstrap = await this.databaseTools.bootstrap(args.pluginId);
            steps[steps.length - 1] = { step: 'bootstrap', status: 'completed', result: bootstrap };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`bootstrap failed: ${msg}`);
            steps[steps.length - 1] = { step: 'bootstrap', status: 'failed', error: msg };
        }

        // Step 3: System explanation
        steps.push({ step: 'system_explanation', status: 'running' });
        try {
            const explanation = await this.databaseTools.systemExplanation(args.pluginId);
            steps[steps.length - 1] = { step: 'system_explanation', status: 'completed', result: explanation };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`system_explanation failed: ${msg}`);
            steps[steps.length - 1] = { step: 'system_explanation', status: 'failed', error: msg };
        }

        // Step 4: Semantic discovery (requirement → candidate context)
        steps.push({ step: 'semantic_discovery', status: 'running', query: args.requirement, limit });
        try {
            const discovery = await this.databaseTools.semanticDiscovery({
                query: args.requirement,
                pluginId: args.pluginId,
                limit
            });
            steps[steps.length - 1] = { step: 'semantic_discovery', status: 'completed', result: discovery };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`semantic_discovery failed: ${msg}`);
            steps[steps.length - 1] = { step: 'semantic_discovery', status: 'failed', error: msg };
        }

        // Step 5: Cross-analysis for explicitly provided candidate files
        if (candidateFiles.length > 0) {
            for (const filePath of candidateFiles) {
                steps.push({ step: 'cross_analysis', status: 'running', filePath });
                try {
                    const analysis = await this.databaseTools.crossAnalysis(filePath, args.pluginId);
                    steps[steps.length - 1] = { step: 'cross_analysis', status: 'completed', filePath, result: analysis };
                } catch (error: any) {
                    const msg = error?.message || String(error);
                    errors.push(`cross_analysis failed for ${filePath}: ${msg}`);
                    steps[steps.length - 1] = { step: 'cross_analysis', status: 'failed', filePath, error: msg };
                }
            }
        }

        const recommendations: string[] = [
            'Reality-Driven Verification (Rule 026): Verify files/functions/exports before changes, compile immediately after each small change, then run end-to-end verification.',
            'Suggested commands: `npm run compile` (or `npm run compile:all`), then `npm run verify:all` (if available).',
            'If docs/ or databases are missing: run `workflow/generate_and_ingest` (or `workflow/full_cycle`) to regenerate docs and ingest before relying on queries.'
        ];

        return {
            status: errors.length > 0 ? 'completed_with_errors' : 'completed',
            requirement: args.requirement,
            limit,
            candidateFiles,
            steps,
            errors: errors.length > 0 ? errors : undefined,
            recommendations
        };
    }

    /**
     * Autonomous refactoring workflow (Phase 3 / Autonomy).
     *
     * Focuses on impact analysis (dependencies, ADR context, change history) and provides
     * a stepwise refactoring checklist aligned with Reality-Driven Verification.
     */
    public async autonomousRefactoring(args: {
        pluginId: string;
        filePath: string;
        goal?: string;
        ensureReady?: boolean;
    }): Promise<any> {
        const steps: any[] = [];
        const errors: string[] = [];

        // Step 1: Status
        steps.push({ step: 'check_status', status: 'running' });
        let systemStatus: any | undefined;
        try {
            systemStatus = await this.checkStatus(args.pluginId);
            steps[steps.length - 1] = { step: 'check_status', status: 'completed', result: systemStatus };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`check_status failed: ${msg}`);
            steps[steps.length - 1] = { step: 'check_status', status: 'failed', error: msg };
        }

        // Optional: ensure docs/ + DBs exist (best-effort)
        if (args.ensureReady === true && systemStatus) {
            const needsDocs = systemStatus.docs?.exists !== true;
            const needsDb = systemStatus.databases?.exists !== true;
            if (needsDocs || needsDb) {
                steps.push({ step: 'generate_and_ingest', status: 'running', reason: 'ensureReady=true and docs/ or databases missing' });
                try {
                    const generateAndIngestResult = await this.generateAndIngest(args.pluginId);
                    steps[steps.length - 1] = { step: 'generate_and_ingest', status: 'completed', result: generateAndIngestResult };
                } catch (error: any) {
                    const msg = error?.message || String(error);
                    errors.push(`generate_and_ingest failed: ${msg}`);
                    steps[steps.length - 1] = { step: 'generate_and_ingest', status: 'failed', error: msg };
                }
            }
        }

        // Step 2: Change history (T-Dimension)
        steps.push({ step: 'query_changes', status: 'running' });
        try {
            const changes = await this.databaseTools.queryChanges(args.pluginId);
            steps[steps.length - 1] = { step: 'query_changes', status: 'completed', result: changes };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`query_changes failed: ${msg}`);
            steps[steps.length - 1] = { step: 'query_changes', status: 'failed', error: msg };
        }

        // Step 3: Cross-analysis (ADRs + Symbols) for the target file
        steps.push({ step: 'cross_analysis', status: 'running', filePath: args.filePath });
        try {
            const analysis = await this.databaseTools.crossAnalysis(args.filePath, args.pluginId);
            steps[steps.length - 1] = { step: 'cross_analysis', status: 'completed', filePath: args.filePath, result: analysis };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`cross_analysis failed for ${args.filePath}: ${msg}`);
            steps[steps.length - 1] = { step: 'cross_analysis', status: 'failed', filePath: args.filePath, error: msg };
        }

        // Step 4: Dependency impact (outgoing + incoming)
        steps.push({ step: 'query_dependencies_outgoing', status: 'running', fromModule: args.filePath });
        let outgoingDeps: any | undefined;
        try {
            outgoingDeps = await this.databaseTools.queryDependencies({ fromModule: args.filePath, pluginId: args.pluginId });
            steps[steps.length - 1] = { step: 'query_dependencies_outgoing', status: 'completed', fromModule: args.filePath, result: outgoingDeps };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`query_dependencies (fromModule) failed for ${args.filePath}: ${msg}`);
            steps[steps.length - 1] = { step: 'query_dependencies_outgoing', status: 'failed', fromModule: args.filePath, error: msg };
        }

        steps.push({ step: 'query_dependencies_incoming', status: 'running', toModule: args.filePath });
        let incomingDeps: any | undefined;
        try {
            incomingDeps = await this.databaseTools.queryDependencies({ toModule: args.filePath, pluginId: args.pluginId });
            steps[steps.length - 1] = { step: 'query_dependencies_incoming', status: 'completed', toModule: args.filePath, result: incomingDeps };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`query_dependencies (toModule) failed for ${args.filePath}: ${msg}`);
            steps[steps.length - 1] = { step: 'query_dependencies_incoming', status: 'failed', toModule: args.filePath, error: msg };
        }

        // Step 5: Architecture mining for patterns (optional but helpful)
        steps.push({ step: 'architecture_mining', status: 'running', filePath: args.filePath });
        try {
            const mining = await this.databaseTools.architectureMining({ pluginId: args.pluginId, filePath: args.filePath });
            steps[steps.length - 1] = { step: 'architecture_mining', status: 'completed', filePath: args.filePath, result: mining };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`architecture_mining failed for ${args.filePath}: ${msg}`);
            steps[steps.length - 1] = { step: 'architecture_mining', status: 'failed', filePath: args.filePath, error: msg };
        }

        // A tiny, deterministic risk hint (based on dep counts, if available)
        const outgoingCount = Array.isArray(outgoingDeps) ? outgoingDeps.length : undefined;
        const incomingCount = Array.isArray(incomingDeps) ? incomingDeps.length : undefined;
        const risk =
            (typeof incomingCount === 'number' && incomingCount >= 10) || (typeof outgoingCount === 'number' && outgoingCount >= 20)
                ? 'high'
                : (typeof incomingCount === 'number' && incomingCount >= 3) || (typeof outgoingCount === 'number' && outgoingCount >= 5)
                    ? 'medium'
                    : 'low';

        const recommendations: string[] = [
            'Reality-Driven Verification (Rule 026): Verify the target file exists, verify key exports before changes, then refactor in small steps with frequent compiles.',
            'Suggested loop: edit ≤3 files → `npm run compile` → fix errors → repeat → finally `npm run verify:all` (if available).',
            'Before refactoring public APIs: check incoming dependencies and ADR constraints via cross_analysis/query_adrs.'
        ];

        return {
            status: errors.length > 0 ? 'completed_with_errors' : 'completed',
            filePath: args.filePath,
            goal: args.goal,
            risk,
            impact: {
                outgoingDependenciesCount: outgoingCount,
                incomingDependenciesCount: incomingCount
            },
            steps,
            errors: errors.length > 0 ? errors : undefined,
            recommendations
        };
    }

    /**
     * Autonomous documentation maintenance (Phase 3 / Autonomy).
     *
     * Identifies documentation gaps and (optionally) generates ADRs deterministically.
     */
    public async autonomousDocumentation(args: {
        pluginId: string;
        minDependencies?: number;
        limit?: number;
        generateAdrs?: boolean;
        dryRun?: boolean;
        verifyAdrs?: boolean;
        ensureReady?: boolean;
    }): Promise<any> {
        const steps: any[] = [];
        const errors: string[] = [];

        const minDependencies = args.minDependencies ?? 5;
        const limit = args.limit ?? 20;
        const generateAdrs = args.generateAdrs === true;
        const dryRun = args.dryRun !== false; // default true
        const verifyAdrs = args.verifyAdrs === true;

        // Step 1: Status
        steps.push({ step: 'check_status', status: 'running' });
        let systemStatus: any | undefined;
        try {
            systemStatus = await this.checkStatus(args.pluginId);
            steps[steps.length - 1] = { step: 'check_status', status: 'completed', result: systemStatus };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`check_status failed: ${msg}`);
            steps[steps.length - 1] = { step: 'check_status', status: 'failed', error: msg };
        }

        // Optional: ensure docs/ + DBs exist (best-effort)
        if (args.ensureReady === true && systemStatus) {
            const needsDocs = systemStatus.docs?.exists !== true;
            const needsDb = systemStatus.databases?.exists !== true;
            if (needsDocs || needsDb) {
                steps.push({ step: 'generate_and_ingest', status: 'running', reason: 'ensureReady=true and docs/ or databases missing' });
                try {
                    const generateAndIngestResult = await this.generateAndIngest(args.pluginId);
                    steps[steps.length - 1] = { step: 'generate_and_ingest', status: 'completed', result: generateAndIngestResult };
                } catch (error: any) {
                    const msg = error?.message || String(error);
                    errors.push(`generate_and_ingest failed: ${msg}`);
                    steps[steps.length - 1] = { step: 'generate_and_ingest', status: 'failed', error: msg };
                }
            }
        }

        // Step 2: Gap analysis (no side effects)
        steps.push({ step: 'gap_analysis', status: 'running', minDependencies, limit });
        let gapAnalysisParsed: any | undefined;
        try {
            const gapAnalysisRaw = await this.databaseTools.gapAnalysis({
                pluginId: args.pluginId,
                minDependencies,
                limit,
                autoGenerateAdrs: false
            });
            gapAnalysisParsed = JSON.parse(gapAnalysisRaw);

            // Determinism: remove any runtime timestamps if present
            if (gapAnalysisParsed?.summary?.analysis_date) {
                delete gapAnalysisParsed.summary.analysis_date;
            }

            steps[steps.length - 1] = { step: 'gap_analysis', status: 'completed', result: gapAnalysisParsed };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`gap_analysis failed: ${msg}`);
            steps[steps.length - 1] = { step: 'gap_analysis', status: 'failed', error: msg };
        }

        // Step 3: Optional ADR generation (deterministic tool, can be dry-run)
        let adrGenerationParsed: any | undefined;
        if (generateAdrs) {
            steps.push({ step: 'adr_generator', status: 'running', minDependencies, limit, dryRun });
            try {
                const adrGenerationRaw = await this.databaseTools.adrGenerator({
                    pluginId: args.pluginId,
                    minDependencies,
                    limit: Math.min(limit, 10),
                    dryRun,
                    useLLM: false
                });
                adrGenerationParsed = adrGenerationRaw;
                steps[steps.length - 1] = { step: 'adr_generator', status: 'completed', result: adrGenerationParsed };
            } catch (error: any) {
                const msg = error?.message || String(error);
                errors.push(`adr_generator failed: ${msg}`);
                steps[steps.length - 1] = { step: 'adr_generator', status: 'failed', error: msg };
            }
        }

        // Step 4: Optional ADR verification
        if (verifyAdrs) {
            steps.push({ step: 'validation/verifyAdrs', status: 'running' });
            try {
                const verifyResult = await this.validationTools.verifyAdrs({ verbose: false });
                steps[steps.length - 1] = { step: 'validation/verifyAdrs', status: 'completed', result: verifyResult };
            } catch (error: any) {
                const msg = error?.message || String(error);
                errors.push(`validation/verifyAdrs failed: ${msg}`);
                steps[steps.length - 1] = { step: 'validation/verifyAdrs', status: 'failed', error: msg };
            }
        }

        const withoutAdrsCount = Array.isArray(gapAnalysisParsed?.gaps?.without_adrs)
            ? gapAnalysisParsed.gaps.without_adrs.length
            : undefined;

        const recommendations: string[] = [
            'Use `gap_analysis` regularly to prioritize documentation gaps (high dependencies, low ADR coverage).',
            'Generate ADRs with `adr_generator` (or alias `generate_adr`) in dry-run first, then run without dry-run to write files.',
            'After generating ADRs, re-run ingestion and then `validation/verifyAdrs` to keep documentation consistent with code.'
        ];

        return {
            status: errors.length > 0 ? 'completed_with_errors' : 'completed',
            minDependencies,
            limit,
            generateAdrs,
            dryRun,
            verifyAdrs,
            summary: {
                modulesWithoutAdrs: withoutAdrsCount,
                generatedAdrs: adrGenerationParsed?.summary?.adrs_generated
            },
            steps,
            errors: errors.length > 0 ? errors : undefined,
            recommendations
        };
    }

    /**
     * Co-Partner workflow: create a structured plan + human checkpoints.
     *
     * This is intentionally lightweight and deterministic. It returns:
     * - a recommended next MCP tool call (feature/refactor/docs)
     * - explicit human approval checkpoints (evidence-based)
     * - rollback guidance (commands only; no side effects)
     */
    public async coPartnerPlan(args: {
        pluginId: string;
        changeType: 'feature' | 'refactor' | 'documentation';
        goal: string;
        targetFiles?: string[];
        constraints?: string[];
        ensureReady?: boolean;
        limit?: number;
    }): Promise<any> {
        const steps: any[] = [];
        const errors: string[] = [];

        const targetFiles = (args.targetFiles ?? []).slice(0, 10);
        const constraints = (args.constraints ?? []).slice(0, 20);
        const ensureReady = args.ensureReady === true;
        const limit = args.limit ?? 5;

        // Step 1: Status (always)
        steps.push({ step: 'check_status', status: 'running' });
        try {
            const status = await this.checkStatus(args.pluginId);
            steps[steps.length - 1] = { step: 'check_status', status: 'completed', result: status };
        } catch (error: any) {
            const msg = error?.message || String(error);
            errors.push(`check_status failed: ${msg}`);
            steps[steps.length - 1] = { step: 'check_status', status: 'failed', error: msg };
        }

        // Determine recommended next tool call
        const recommendedToolCalls: Array<{ name: string; arguments: any }> = [];
        if (args.changeType === 'feature') {
            recommendedToolCalls.push({
                name: 'workflow/autonomous_feature',
                arguments: {
                    pluginId: args.pluginId,
                    requirement: args.goal,
                    limit,
                    candidateFiles: targetFiles,
                    ensureReady
                }
            });
        } else if (args.changeType === 'refactor') {
            const filePath = targetFiles[0];
            if (!filePath) {
                errors.push('refactor requires targetFiles[0] (filePath).');
            } else {
                recommendedToolCalls.push({
                    name: 'workflow/autonomous_refactoring',
                    arguments: {
                        pluginId: args.pluginId,
                        filePath,
                        goal: args.goal,
                        ensureReady
                    }
                });
            }
        } else if (args.changeType === 'documentation') {
            recommendedToolCalls.push({
                name: 'workflow/autonomous_documentation',
                arguments: {
                    pluginId: args.pluginId,
                    minDependencies: 5,
                    limit: 20,
                    generateAdrs: false,
                    dryRun: true,
                    verifyAdrs: false,
                    ensureReady
                }
            });
        }

        const humanCheckpoints = [
            {
                stage: 'before_implementation',
                requiredEvidence: [
                    'Reality-check: file(s) exist, functions/exports exist (Rule 026).',
                    'Impact context captured via cross_analysis / query_dependencies.',
                    'Architecture constraints reviewed via relevant ADRs.'
                ]
            },
            {
                stage: 'after_implementation',
                requiredEvidence: [
                    '`npm run compile` succeeded.',
                    '`npm test` (or relevant test suite) succeeded.',
                    '`npm run verify:all` succeeded (if available).'
                ]
            }
        ];

        const rollback = await this.coPartnerRollback({
            strategy: 'git',
            targetPaths: targetFiles
        });

        return {
            status: errors.length > 0 ? 'completed_with_errors' : 'completed',
            changeType: args.changeType,
            goal: args.goal,
            targetFiles,
            constraints,
            recommendedToolCalls,
            humanCheckpoints,
            rollback,
            steps,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    /**
     * Co-Partner workflow: interpret human feedback and suggest next action.
     *
     * Deterministic heuristics only (no LLM).
     */
    public async coPartnerFeedback(args: {
        stage: 'analysis' | 'implementation' | 'verification' | 'review';
        feedback: string;
    }): Promise<any> {
        const feedbackLower = (args.feedback || '').toLowerCase();

        const rollbackKeywords = ['rollback', 'revert', 'zurück', 'zurueck', 'abbrechen', 'stop'];
        const approveKeywords = ['ok', 'passt', 'go', 'weiter', 'approve', 'approved', '✅'];

        const wantsRollback = rollbackKeywords.some(k => feedbackLower.includes(k));
        const approved = approveKeywords.some(k => feedbackLower.includes(k));

        const nextAction =
            wantsRollback ? 'rollback'
                : approved ? 'continue'
                    : 'revise_plan';

        const recommendations: string[] = [
            'If action is rollback: use `workflow/co_partner_rollback` guidance and revert to last known-good state.',
            'If action is revise_plan: rerun analysis tools (semantic_discovery/cross_analysis) and adjust the implementation plan.',
            'If action is continue: proceed with next small change batch (≤3 files) and compile immediately.'
        ];

        return {
            status: 'completed',
            stage: args.stage,
            feedback: args.feedback,
            nextAction,
            recommendations
        };
    }

    /**
     * Co-Partner workflow: rollback guidance (commands only; no side effects).
     */
    public async coPartnerRollback(args: {
        strategy: 'git' | 'docs_db';
        targetPaths?: string[];
    }): Promise<any> {
        const targetPaths = (args.targetPaths ?? []).slice(0, 20);

        if (args.strategy === 'docs_db') {
            return {
                strategy: 'docs_db',
                notes: [
                    'This is not a true rollback. It provides deterministic regeneration steps for docs/ and databases.',
                    'Use this when generated docs/ or ingested DBs are inconsistent.'
                ],
                powershell: [
                    'npm run docs:full .',
                    'npm run db:ingest .',
                    'npm run db:embedding .'
                ],
                bash: [
                    'npm run docs:full .',
                    'npm run db:ingest .',
                    'npm run db:embedding .'
                ]
            };
        }

        // Default: git rollback guidance
        const pathArgs = targetPaths.length > 0 ? targetPaths.map(p => `"${p}"`).join(' ') : '';

        return {
            strategy: 'git',
            warning: 'These commands are destructive. Use with care. Prefer reverting only the affected paths first.',
            targetPaths,
            powershell: [
                'git status',
                pathArgs ? `git restore --staged -- ${pathArgs}` : 'git restore --staged .',
                pathArgs ? `git restore -- ${pathArgs}` : 'git restore .',
                '# If you need to discard ALL local changes (danger):',
                '# git reset --hard HEAD'
            ],
            bash: [
                'git status',
                pathArgs ? `git restore --staged -- ${pathArgs}` : 'git restore --staged .',
                pathArgs ? `git restore -- ${pathArgs}` : 'git restore .',
                '# If you need to discard ALL local changes (danger):',
                '# git reset --hard HEAD'
            ]
        };
    }

    /**
     * Check if ingestion is needed.
     */
    private async checkIngestStatus(): Promise<{ needed: boolean; message: string }> {
        const docsPath = WorkspaceResolver.findDocsDirectory(this.workspaceRoot);
        const dbPath = path.join(this.workspaceRoot, '.database-plugin', 'modules.db');

        if (!docsPath) {
            return { needed: false, message: 'docs/ directory not found' };
        }

        if (!fs.existsSync(dbPath)) {
            return { needed: true, message: 'Databases not found, ingestion needed' };
        }

        return { needed: false, message: 'Databases exist, ingestion may not be needed' };
    }

    /**
     * Check if embeddings are needed.
     */
    private async checkEmbeddingStatus(): Promise<{ needed: boolean; message: string }> {
        const embeddingPath = path.join(this.workspaceRoot, '.database-plugin', 'vectors.db');

        if (!fs.existsSync(embeddingPath)) {
            return { needed: true, message: 'Embeddings not found, generation needed' };
        }

        return { needed: false, message: 'Embeddings exist' };
    }

    /**
     * Verifies plugin ID consistency between calculated value and database content.
     * Critical for foreign systems where plugin ID mismatches cause empty query results.
     */
    private async verifyPluginId(calculatedPluginId: string, dbPath: string): Promise<any> {
        const pluginIdInfo: any = {
            calculated: calculatedPluginId,
            normalizedWorkspaceRoot: path.resolve(this.workspaceRoot).replace(/\\/g, '/').toLowerCase(),
            databasePluginIds: {},
            verified: false,
            match: false,
            issues: []
        };

        // Try to use database tools if available AND initialized (preferred method)
        const moduleApi = (this.databaseTools as any)?.moduleApi;
        if (moduleApi?.getModuleByPath && this.databaseTools) {
            try {
                // Try to query modules to verify plugin ID
                const testResult = await this.databaseTools.queryModules('', calculatedPluginId);
                if (!testResult || (Array.isArray(testResult) && testResult.length === 0)) {
                    pluginIdInfo.match = false;
                    pluginIdInfo.issues.push(
                        `No modules found with calculated plugin ID (${calculatedPluginId}). This will cause empty query results.`
                    );
                } else {
                    pluginIdInfo.verified = true;
                    pluginIdInfo.entityCount = {
                        modules: Array.isArray(testResult) ? testResult.length : 1
                    };
                    pluginIdInfo.match = true;
                }
            } catch (error: any) {
                pluginIdInfo.issues.push(`Error verifying plugin ID via database tools: ${error.message}`);
            }
        } else {
            // Tools not initialized (typically because plugin wasn't detected/available)
            pluginIdInfo.issues.push(
                'Plugin ID verification skipped: database tools are not initialized (5D Database Plugin not detected/available).'
            );
        }

        // If database tools not available or no modules found, add warning
        if (!this.databaseTools || (!pluginIdInfo.entityCount || pluginIdInfo.entityCount.modules === 0)) {
            pluginIdInfo.issues.push(
                'Plugin ID verification incomplete. Database tools not available or no modules found. ' +
                'This may indicate a plugin ID mismatch. Run ingestion with the correct workspace root to fix.'
            );
        }

        return pluginIdInfo;
    }

    /**
     * Generate system contract.
     * 
     * @param pluginId Plugin ID (optional)
     * @returns System contract with sources
     */
    public async systemContract(args: {
        pluginId?: string;
        mode?: 'refs' | 'full';
        expand?: string[];
    }): Promise<any> {
        const resolvedPluginId = this.resolvePluginId(args.pluginId);
        const mode = args.mode || 'refs';
        const expand = args.expand || [];
        
        const generator = new SystemContractGenerator(this.workspaceRoot, this);
        
        try {
            // Always generate contract (as projection, not stored)
            const contract = await generator.generate(resolvedPluginId);
            
            // Compute artifact ID and checksum
            const contractJson = JSON.stringify(contract);
            const checksum = crypto.createHash('sha256').update(contractJson).digest('hex').substring(0, 16);
            const artifactId = crypto.createHash('sha256')
                .update(`${resolvedPluginId}:system_contract:${contract.contract_version}:${checksum}`)
                .digest('hex')
                .substring(0, 16);
            
            // Create evidence sources (compatible with EvidenceSource interface)
            const evidenceSources: Array<{
                type: 'ADR' | 'MODULE' | 'SYMBOL' | 'DEPENDENCY' | 'DB_QUERY' | 'STATUS_CHECK' | 'CONTRACT';
                id?: string;
                path?: string;
                hash?: string;
                metadata?: Record<string, any>;
            }> = [];
            
            // Add sources from contract.sources
            if (Array.isArray(contract.sources)) {
                for (const source of contract.sources) {
                    if (source.type === 'SYSTEM_METADATA') {
                        evidenceSources.push({
                            type: 'CONTRACT',
                            path: source.path,
                            hash: source.hash,
                            metadata: { version: contract.contract_version }
                        });
                    } else if (source.type === 'STATUS_CHECK') {
                        evidenceSources.push({
                            type: 'STATUS_CHECK',
                            path: source.path,
                            hash: source.hash
                        });
                    }
                }
            }
            
            // Add dimension sources (inferred from contract) - use DB_QUERY for dimensions
            if (contract.dimensions) {
                for (const dim of ['X', 'Y', 'Z', 'W', 'T', 'V'] as const) {
                    if (contract.dimensions[dim]) {
                        evidenceSources.push({
                            type: 'DB_QUERY',
                            id: dim,
                            metadata: { dimension: dim }
                        });
                    }
                }
            }
            
            // Create evidence (INFERRED from multiple sources)
            const evidence = {
                grade: 'INFERRED' as const,
                sources: evidenceSources,
                description: 'System contract derived from dimension facts, runtime status, and system metadata'
            };
            
            // Default: refs mode - return only reference
            if (mode === 'refs') {
                // Build preview
                const preview = {
                    system_id: contract.system_id,
                    dimensions_count: Object.keys(contract.dimensions || {}).length,
                    capabilities_count: contract.capabilities?.tools?.length || 0,
                    plugins: (contract.plugins || []).map((p: any) => p.name || p)
                };
                
                return {
                    artifact_id: artifactId,
                    artifact_type: 'system_contract',
                    contract_version: contract.contract_version,
                    generated_at: contract.generated_at,
                    checksum,
                    evidence,
                    preview
                };
            }
            
            // Full mode: return complete contract (gated)
            if (mode === 'full') {
                // Enforce max size (approximate)
                const contractSize = contractJson.length;
                const maxSize = 1000000; // 1MB limit
                if (contractSize > maxSize) {
                    throw new Error(`Contract size (${contractSize} bytes) exceeds maximum (${maxSize} bytes). Use expand parameter to request specific sections.`);
                }
                
                return {
                    artifact_id: artifactId,
                    artifact_type: 'system_contract',
                    contract_version: contract.contract_version,
                    generated_at: contract.generated_at,
                    checksum,
                    evidence,
                    contract
                };
            }
            
            // Expand mode: return contract with only requested sections expanded
            const result: any = {
                artifact_id: artifactId,
                artifact_type: 'system_contract',
                contract_version: contract.contract_version,
                generated_at: contract.generated_at,
                checksum,
                evidence
            };
            
            // Add expanded sections
            if (expand.includes('dimensions')) {
                result.dimensions = contract.dimensions;
            }
            if (expand.includes('capabilities')) {
                result.capabilities = contract.capabilities;
            }
            if (expand.includes('runtime_dependencies')) {
                result.runtime_dependencies = contract.runtime_dependencies;
            }
            if (expand.includes('public_api')) {
                result.public_api = contract.public_api;
            }
            if (expand.includes('import_map')) {
                result.import_map = contract.import_map;
            }
            
            return result;
        } catch (error: any) {
            throw new Error(`Failed to generate system contract: ${error?.message || String(error)}`);
        }
    }

    /**
     * Generate tools manifest.
     * 
     * @param args Arguments (pluginId, mode, expand)
     * @returns Tools manifest (refs-first)
     */
    public async toolsManifest(args: {
        pluginId?: string;
        mode?: 'refs' | 'full';
        expand?: string[];
    }): Promise<any> {
        const resolvedPluginId = this.resolvePluginId(args.pluginId);
        const mode = args.mode || 'refs';
        const expand = args.expand || [];
        
        // Try to generate system contract (as projection)
        // In refs mode, we can work without SYSTEM_METADATA.json
        let contractResult: any = null;
        let contract: any = null;
        let contractError: Error | null = null;
        
        try {
            contractResult = await this.systemContract({ pluginId: resolvedPluginId, mode: 'full' });
            contract = contractResult.contract;
        } catch (error: any) {
            contractError = error;
            // In refs mode, we can still return a minimal reference
            if (mode === 'refs') {
                // Return minimal reference immediately
                const minimalManifest = {
                    version: '1.0.0',
                    generated_at: new Date().toISOString(),
                    tools: []
                };
                const manifestJson = JSON.stringify(minimalManifest);
                const checksum = crypto.createHash('sha256').update(manifestJson).digest('hex').substring(0, 16);
                const artifactId = crypto.createHash('sha256')
                    .update(`${resolvedPluginId}:tools_manifest:${minimalManifest.version}:${checksum}`)
                    .digest('hex')
                    .substring(0, 16);
                
                // Create evidence (HEURISTIC - system metadata missing)
                const evidence = {
                    grade: 'HEURISTIC' as const,
                    sources: [],
                    description: 'Tools manifest cannot be generated: SYSTEM_METADATA.json not found. Run documentation generation first.'
                };
                
                return {
                    artifact_id: artifactId,
                    artifact_type: 'tools_manifest',
                    manifest_version: minimalManifest.version,
                    generated_at: minimalManifest.generated_at,
                    checksum,
                    evidence,
                    preview: {
                        tools_count: 0,
                        categories: [],
                        warning: 'SYSTEM_METADATA.json not found. Run documentation generation first for full manifest.'
                    }
                };
            } else {
                // In full mode, we need the contract
                throw new Error(`Failed to generate tools manifest: System contract generation failed. ${error?.message || String(error)}. Run documentation generation first to create SYSTEM_METADATA.json.`);
            }
        }
        
        // Import ToolsManifestGenerator
        const { ToolsManifestGenerator } = await import('./tools-manifest-generator.js');
        const generator = new ToolsManifestGenerator();
        
        // Generate manifest from contract
        const manifest = generator.generate(contract);
        
        // Compute artifact ID and checksum
        const manifestJson = JSON.stringify(manifest);
        const checksum = crypto.createHash('sha256').update(manifestJson).digest('hex').substring(0, 16);
        const artifactId = crypto.createHash('sha256')
            .update(`${resolvedPluginId}:tools_manifest:${manifest.version}:${checksum}`)
            .digest('hex')
            .substring(0, 16);
        
        // Create evidence sources (compatible with EvidenceSource interface)
        const evidenceSources: Array<{
            type: 'ADR' | 'MODULE' | 'SYMBOL' | 'DEPENDENCY' | 'DB_QUERY' | 'STATUS_CHECK' | 'CONTRACT';
            id?: string;
            path?: string;
            hash?: string;
            metadata?: Record<string, any>;
        }> = [
            {
                type: 'CONTRACT',
                hash: contractResult.checksum,
                metadata: { version: contract.contract_version }
            }
        ];
        
        // Create evidence (INFERRED from contract)
        const evidence = {
            grade: 'INFERRED' as const,
            sources: evidenceSources,
            description: 'Tools manifest derived from system contract capabilities'
        };
        
        // Default: refs mode - return only reference
        if (mode === 'refs') {
            // Build preview
            const categories = new Set<string>();
            for (const tool of manifest.tools) {
                if (tool.name.includes('_')) {
                    const category = tool.name.split('_')[0];
                    categories.add(category);
                }
            }
            
            const preview = {
                tools_count: manifest.tools.length,
                categories: Array.from(categories).sort()
            };
            
            return {
                artifact_id: artifactId,
                artifact_type: 'tools_manifest',
                manifest_version: manifest.version,
                generated_at: manifest.generated_at,
                checksum,
                evidence,
                preview
            };
        }
        
        // Full mode: return complete manifest (gated)
        if (mode === 'full') {
            // Enforce max size (approximate)
            const manifestSize = manifestJson.length;
            const maxSize = 500000; // 500KB limit
            if (manifestSize > maxSize) {
                throw new Error(`Manifest size (${manifestSize} bytes) exceeds maximum (${maxSize} bytes). Use expand parameter to request specific sections.`);
            }
            
            return {
                artifact_id: artifactId,
                artifact_type: 'tools_manifest',
                manifest_version: manifest.version,
                generated_at: manifest.generated_at,
                checksum,
                evidence,
                manifest
            };
        }
        
        // Expand mode: return manifest with only requested sections expanded
        const result: any = {
            artifact_id: artifactId,
            artifact_type: 'tools_manifest',
            manifest_version: manifest.version,
            generated_at: manifest.generated_at,
            checksum,
            evidence
        };
        
        // Add expanded sections
        if (expand.includes('tools')) {
            result.tools = manifest.tools;
        }
        
        return result;
    }

    /**
     * Export system snapshot (refs-first).
     * 
     * @param args Arguments (outputPath, delta, lastSnapshotHash, pluginId, mode, expand)
     * @returns Snapshot export result (refs-first)
     */
    public async exportSnapshot(args: {
        outputPath?: string;
        delta?: boolean;
        lastSnapshotHash?: string;
        pluginId?: string;
        mode?: 'refs' | 'full';
        expand?: string[];
    }): Promise<any> {
        const { SnapshotExporter } = await import('./snapshot-exporter.js');
        const resolvedPluginId = this.resolvePluginId(args.pluginId);
        const mode = args.mode || 'refs';
        const expand = args.expand || [];
        const snapshotType = args.delta ? 'delta' : 'full';
        
        const exporter = new SnapshotExporter(this.workspaceRoot, this);
        
        // Generate snapshot (as projection, refs-first per ADR-055)
        let snapshot: any;
        try {
            if (args.delta && args.lastSnapshotHash) {
                snapshot = await exporter.exportDelta(args.lastSnapshotHash, resolvedPluginId, mode, expand);
            } else {
                snapshot = await exporter.exportFull(resolvedPluginId, mode, expand);
            }
        } catch (error: any) {
            throw new Error(`Failed to generate snapshot: ${error?.message || String(error)}`);
        }
        
        // In refs mode, snapshot already has artifact_id, checksum, and evidence
        // In full mode, we need to add them for consistency
        if (mode === 'full' && !snapshot.artifact_id) {
            const snapshotJson = JSON.stringify(snapshot);
            const checksum = crypto.createHash('sha256').update(snapshotJson).digest('hex').substring(0, 16);
            const artifactId = crypto.createHash('sha256')
                .update(`${resolvedPluginId}:snapshot:${snapshotType}:${snapshot.snapshot_version}:${checksum}`)
                .digest('hex')
                .substring(0, 16);
            
            snapshot.artifact_id = artifactId;
            snapshot.artifact_type = 'snapshot';
            snapshot.checksum = checksum;
            
            // Create evidence sources (compatible with EvidenceSource interface)
            const evidenceSources: Array<{
                type: 'ADR' | 'MODULE' | 'SYMBOL' | 'DEPENDENCY' | 'DB_QUERY' | 'STATUS_CHECK' | 'CONTRACT';
                id?: string;
                path?: string;
                hash?: string;
                metadata?: Record<string, any>;
            }> = [
                {
                    type: 'CONTRACT',
                    hash: snapshot.checksums?.contract,
                    metadata: { version: snapshot.contract?.contract_version }
                }
            ];
            
            // Add dimension sources - use DB_QUERY for dimensions
            for (const slice of snapshot.dimension_slices || []) {
                evidenceSources.push({
                    type: 'DB_QUERY',
                    id: slice.dimension,
                    hash: slice.checksum,
                    metadata: { dimension: slice.dimension, count: slice.count }
                });
            }
            
            // Create evidence (INFERRED from contract and dimensions)
            snapshot.evidence = {
                grade: 'INFERRED' as const,
                sources: evidenceSources,
                description: 'Snapshot derived from system contract and dimension slices'
            };
        }
        
        // Optional: Export to file (only transport, not truth)
        // In refs mode, only export if outputPath is explicitly provided
        // In full mode, export by default (or if outputPath is provided)
        let filePath: string | undefined;
        if (args.outputPath || (mode === 'full' && !args.outputPath)) {
            const outputPath = args.outputPath || path.join(this.workspaceRoot, `snapshot_${snapshotType}_${Date.now()}.json`);
            try {
                exporter.write(snapshot, outputPath);
                filePath = outputPath;
                snapshot.file_path = filePath;
            } catch (error: any) {
                // File export is optional, don't fail if it fails
            }
        }
        
        // Default: refs mode - return only reference
        if (mode === 'refs') {
            // In refs mode, snapshot already has artifact_id, checksum, and evidence from SnapshotExporter
            // Build preview (use snapshot.preview if available, otherwise build from snapshot data)
            const preview = snapshot.preview || {
                contract_version: snapshot.contract?.contract_version || null,
                dimensions_included: (snapshot.dimension_slices || []).map((s: any) => s.dimension),
                checksums: snapshot.checksums || {}
            };
            
            return {
                artifact_id: snapshot.artifact_id,
                artifact_type: snapshot.artifact_type || 'snapshot',
                snapshot_type: snapshot.snapshot_type || snapshotType,
                snapshot_version: snapshot.snapshot_version,
                generated_at: snapshot.generated_at,
                checksum: snapshot.checksum,
                evidence: snapshot.evidence,
                file_path: filePath || snapshot.file_path,
                preview
            };
        }
        
        // Full mode: return complete snapshot (gated)
        if (mode === 'full') {
            // Enforce max size (approximate)
            const snapshotJson = JSON.stringify(snapshot);
            const snapshotSize = snapshotJson.length;
            const maxSize = 5000000; // 5MB limit
            if (snapshotSize > maxSize) {
                throw new Error(`Snapshot size (${snapshotSize} bytes) exceeds maximum (${maxSize} bytes). Use expand parameter to request specific sections.`);
            }
            
            // In full mode, artifact_id, checksum, and evidence are already added to snapshot in lines 2165-2207
            return {
                artifact_id: snapshot.artifact_id,
                artifact_type: snapshot.artifact_type || 'snapshot',
                snapshot_type: snapshot.snapshot_type || snapshotType,
                snapshot_version: snapshot.snapshot_version,
                generated_at: snapshot.generated_at,
                checksum: snapshot.checksum,
                evidence: snapshot.evidence,
                file_path: filePath || snapshot.file_path,
                ...snapshot  // Spread all snapshot properties (contract, dimension_slices, checksums, etc.)
            };
        }
        
        // Expand mode: return snapshot with only requested sections expanded
        // This code should not be reached if mode is 'refs' or 'full', but we handle it for safety
        const result: any = {
            artifact_id: snapshot.artifact_id,
            artifact_type: snapshot.artifact_type || 'snapshot',
            snapshot_type: snapshot.snapshot_type || snapshotType,
            snapshot_version: snapshot.snapshot_version,
            generated_at: snapshot.generated_at,
            checksum: snapshot.checksum,
            evidence: snapshot.evidence,
            file_path: filePath || snapshot.file_path
        };
        
        // Add expanded sections
        if (expand.includes('contract')) {
            result.contract = snapshot.contract;
        }
        if (expand.includes('dimensions')) {
            result.dimension_slices = snapshot.dimension_slices;
        }
        if (expand.includes('checksums')) {
            result.checksums = snapshot.checksums;
        }
        
        return result;
    }

    /**
     * Get snapshot by artifact ID (refs-first).
     * 
     * @param args Arguments (artifactId, pluginId, mode, expand)
     * @returns Snapshot (refs-first)
     */
    public async snapshotGet(args: {
        artifactId: string;
        pluginId?: string;
        mode?: 'refs' | 'full';
        expand?: string[];
    }): Promise<any> {
        // For now, snapshots are not stored, so we can't retrieve by ID
        // This would require a registry (small file with IDs + checksums)
        // For now, return error
        throw new Error('Snapshot retrieval by artifact ID not yet implemented. Use exportSnapshot to generate snapshots.');
    }

    /**
     * Import system snapshot.
     * 
     * @param args Arguments (snapshotPath, delta, pluginId)
     * @returns Snapshot import result
     */
    public async importSnapshot(args: {
        snapshotPath: string;
        delta?: boolean;
        pluginId?: string;
    }): Promise<any> {
        const { SnapshotImporter } = await import('./snapshot-importer.js');
        const resolvedPluginId = this.resolvePluginId(args.pluginId);
        const importer = new SnapshotImporter(this.workspaceRoot, this);
        
        try {
            const result = await importer.import(args.snapshotPath, args.delta || false);
            return {
                status: result.status,
                imported_dimensions: result.imported_dimensions,
                skipped_dimensions: result.skipped_dimensions,
                checksum_validation: result.checksum_validation,
                errors: result.errors,
                message: 'Snapshot imported successfully'
            };
        } catch (error: any) {
            throw new Error(`Failed to import snapshot: ${error?.message || String(error)}`);
        }
    }
}

