import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WorkspaceResolver } from './workspace-resolver.js';
import { DatabasePluginAdapter } from './plugins/database-plugin-adapter.js';
import { DocumentationPluginAdapter } from './plugins/documentation-plugin-adapter.js';
import { DatabaseTools } from './tools/database-tools.js';
import { ValidationTools } from './tools/validation-tools.js';
import { OrchestrationTools } from './tools/orchestration-tools.js';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Unified MCP Server for Noyrax Workspace.
 * Orchestrates both 5D Database Plugin and Documentation System Plugin.
 */
export class UnifiedMcpServer {
    private server: Server;
    private workspaceRoot: string;
    private databaseAdapter: DatabasePluginAdapter;
    private documentationAdapter: DocumentationPluginAdapter;
    private databaseTools: DatabaseTools;
    private validationTools: ValidationTools;
    private orchestrationTools: OrchestrationTools;
    private initialized: boolean = false;
    private initializationError: string | null = null;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        
        // Load .env file
        this.loadEnvFile();

        // Initialize adapters
        const pluginPaths = WorkspaceResolver.findPluginPaths(workspaceRoot);
        this.databaseAdapter = new DatabasePluginAdapter(workspaceRoot, pluginPaths.databasePlugin);
        this.documentationAdapter = new DocumentationPluginAdapter(workspaceRoot, pluginPaths.documentationPlugin);

        // Initialize tools
        this.databaseTools = new DatabaseTools(this.databaseAdapter);
        this.validationTools = new ValidationTools(this.documentationAdapter);
        this.orchestrationTools = new OrchestrationTools(
            this.databaseTools,
            this.validationTools,
            workspaceRoot
        );

        // Initialize MCP server
        this.server = new Server(
            {
                name: 'noyrax-unified-mcp-server',
                version: '1.0.0'
            },
            {
                capabilities: {
                    resources: {},
                    tools: {}
                }
            }
        );

        this.setupResources();
        this.setupTools();
    }

    /**
     * Loads .env file from workspace root or parent directories.
     */
    private loadEnvFile(): void {
        let currentPath = this.workspaceRoot;
        const maxDepth = 5;

        for (let depth = 0; depth < maxDepth; depth++) {
            const envPath = path.join(currentPath, '.env');
            if (fs.existsSync(envPath)) {
                config({ path: envPath });
                return;
            }

            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) {
                break;
            }
            currentPath = parentPath;
        }
    }

    /**
     * Initializes database tools (async initialization).
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            if (this.databaseAdapter.isAvailable()) {
                await this.databaseTools.initialize();
            }
            this.initialized = true;
            this.initializationError = null;
        } catch (error: any) {
            // IMPORTANT: Do NOT throw here. We want the MCP server to start even if DB init fails
            // (e.g. sqlite3 native binding issues). Tools like workflow/check_status must remain usable.
            this.initialized = false;
            this.initializationError = error?.message || String(error);
        }
    }

    /**
     * Sets up MCP resources.
     */
    private setupResources(): void {
        const ListResourcesRequestSchema = z.object({
            method: z.literal('resources/list'),
            // Cursor may omit params for list requests. Keep this permissive.
            params: z.any().optional()
        });

        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            const pluginId = this.resolvePluginId();
            return {
                resources: [
                    {
                        uri: `db://modules/${pluginId}`,
                        name: 'Modules (X-Dimension)',
                        description: 'All modules in the database'
                    },
                    {
                        uri: `db://symbols/${pluginId}`,
                        name: 'Symbols (Y-Dimension)',
                        description: 'All symbols in the database'
                    },
                    {
                        uri: `db://dependencies/${pluginId}`,
                        name: 'Dependencies (Z-Dimension)',
                        description: 'All dependencies in the database'
                    },
                    {
                        uri: `db://adrs/${pluginId}`,
                        name: 'ADRs (W-Dimension)',
                        description: 'All ADRs in the database'
                    },
                    {
                        uri: `db://changes/${pluginId}`,
                        name: 'Changes (T-Dimension)',
                        description: 'All change reports in the database'
                    }
                ]
            };
        });

        const ReadResourceRequestSchema = z.object({
            method: z.literal('resources/read'),
            params: z.object({
                uri: z.string()
            })
        });

        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            // Resource reading would be implemented here
            throw new Error(`Resource reading not yet implemented: ${request.params.uri}`);
        });
    }

    /**
     * Sets up MCP tools.
     */
    private setupTools(): void {
        const ListToolsRequestSchema = z.object({
            method: z.literal('tools/list'),
            // Cursor may omit params for list requests. Keep this permissive.
            params: z.any().optional()
        });

        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools: any[] = [];

            // Database tools
            if (this.databaseAdapter.isAvailable()) {
                tools.push(
                    {
                        name: 'query_modules',
                        description: 'Query modules by file path',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                filePath: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['filePath', 'pluginId']
                        }
                    },
                    {
                        name: 'query_symbols',
                        description: 'Query symbols by path or symbol ID',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                path: { type: 'string' as const },
                                symbolId: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'query_dependencies',
                        description: 'Query dependencies by module',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                fromModule: { type: 'string' as const },
                                toModule: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'query_adrs',
                        description: 'Query ADRs by number or path',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                adrNumberOrPath: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['adrNumberOrPath', 'pluginId']
                        }
                    },
                    {
                        name: 'query_changes',
                        description: 'Query change reports',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'cross_analysis',
                        description: 'Perform cross-dimension analysis',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                filePath: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['filePath', 'pluginId']
                        }
                    },
                    {
                        name: 'semantic_discovery',
                        description: 'Semantic search and context retrieval (uses Semantic Brain)',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                query: { type: 'string' as const },
                                pluginId: { type: 'string' as const },
                                limit: { type: 'number' as const, default: 10 }
                            },
                            required: ['query', 'pluginId']
                        }
                    },
                    {
                        name: 'system_explanation',
                        description: 'Get system overview, entry points, and architecture ADRs',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'learning_path',
                        description: 'Generate guided learning path for understanding a topic',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                topic: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['topic', 'pluginId']
                        }
                    },
                    {
                        name: 'bootstrap',
                        description: 'Get bootstrap information for first-time system understanding',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'gap_analysis',
                        description: 'Find documentation gaps by analyzing modules with many dependencies but few/no ADRs. Returns context information (similar modules with ADRs, dependency details, cross-dimension context) for KI-Agent to create ADRs. autoGenerateAdrs is false by default.',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const },
                                minDependencies: { type: 'number' as const, default: 5 },
                                limit: { type: 'number' as const, default: 50 },
                                autoGenerateAdrs: { type: 'boolean' as const, default: false, description: 'Automatically generate ADRs (default: false). When false, provides context_for_adr_generation for KI-Agent.' }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'architecture_mining',
                        description: 'Mine architectural decisions from code structure',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const },
                                filePath: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'generate_documentation',
                        description: 'Generate documentation using Noyrax',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'check_docs_status',
                        description: 'Check if docs/ directory exists and is up-to-date',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'adr_generator',
                        description: 'Reconstruct ADRs from 5D dimensions for modules with documentation gaps (deterministic). Optional LLM for \"Why\" reconstruction.',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const },
                                minDependencies: { type: 'number' as const, default: 5 },
                                limit: { type: 'number' as const, default: 10 },
                                dryRun: { type: 'boolean' as const, default: false },
                                useLLM: { type: 'boolean' as const, default: false },
                                llmModel: { type: 'string' as const, default: 'gpt-4o-mini' }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        // Alias for compatibility with older plans/docs.
                        name: 'generate_adr',
                        description: 'Alias for adr_generator. Reconstruct ADRs from 5D dimensions (deterministic).',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const },
                                minDependencies: { type: 'number' as const, default: 5 },
                                limit: { type: 'number' as const, default: 10 },
                                dryRun: { type: 'boolean' as const, default: false },
                                useLLM: { type: 'boolean' as const, default: false },
                                llmModel: { type: 'string' as const, default: 'gpt-4o-mini' }
                            },
                            required: ['pluginId']
                        }
                    }
                );
            }

            // Validation tools
            if (this.documentationAdapter.isAvailable()) {
                tools.push(
                    {
                        name: 'validation_runScan',
                        description: 'Run documentation scan',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                files: {
                                    type: 'array' as const,
                                    items: { type: 'string' as const }
                                },
                                incremental: { type: 'boolean' as const, default: true }
                            }
                        }
                    },
                    {
                        name: 'validation_runValidate',
                        description: 'Run documentation validation',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                files: {
                                    type: 'array' as const,
                                    items: { type: 'string' as const }
                                },
                                verbose: { type: 'boolean' as const, default: false }
                            }
                        }
                    },
                    {
                        name: 'validation_runDriftCheck',
                        description: 'Check for drift between code and documentation',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                since: { type: 'string' as const }
                            }
                        }
                    },
                    {
                        name: 'validation_analyzeImpact',
                        description: 'Analyze impact of changes to a file or symbol',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                file: { type: 'string' as const },
                                symbol: { type: 'string' as const }
                            },
                            required: ['file']
                        }
                    },
                    {
                        name: 'validation_verifyAdrs',
                        description: 'Verify ADR claims against code',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                verbose: { type: 'boolean' as const, default: false }
                            }
                        }
                    }
                );
            }

            // Orchestration tools
            tools.push(
                {
                    name: 'workflow_full_cycle',
                    description: 'Full workflow: Scan → Generate → Validate → Ingest → Embeddings',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'workflow_generate_and_ingest',
                    description: 'Generate documentation and ingest into database',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'workflow_check_status',
                    description: 'Check system status (docs/, databases, embeddings)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const }
                        }
                    }
                },
                {
                    name: 'workflow_ensure_ready',
                    description: 'Best-effort: ensure docs/ and databases exist (generate docs if needed, ingest databases) and return readiness',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const }
                        }
                    }
                },
                {
                    name: 'workflow_onboard',
                    description: 'Onboard a foreign codebase: ensure readiness (optional) and return a deterministic onboarding report (Markdown + JSON)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            ensureReady: { type: 'boolean' as const, default: true },
                            semanticQueries: {
                                type: 'array' as const,
                                items: { type: 'string' as const }
                            },
                            semanticLimit: { type: 'number' as const, default: 5 },
                            gapMinDependencies: { type: 'number' as const, default: 5 },
                            gapLimit: { type: 'number' as const, default: 20 }
                        }
                    }
                },
                {
                    name: 'workflow_ingest',
                    description: 'Ingest documentation into database (full or incremental)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            full: { type: 'boolean' as const, default: true }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'workflow_autonomous_feature',
                    description: 'Autonomous feature workflow: collect context (bootstrap/system_explanation/semantic_discovery) and return a structured plan + verification guidance',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            requirement: { type: 'string' as const },
                            limit: { type: 'number' as const, default: 5 },
                            candidateFiles: {
                                type: 'array' as const,
                                items: { type: 'string' as const }
                            },
                            ensureReady: { type: 'boolean' as const, default: false }
                        },
                        required: ['pluginId', 'requirement']
                    }
                },
                {
                    name: 'workflow_autonomous_refactoring',
                    description: 'Autonomous refactoring workflow: impact analysis (dependencies + ADR context + change history) and a stepwise verification checklist',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            filePath: { type: 'string' as const },
                            goal: { type: 'string' as const },
                            ensureReady: { type: 'boolean' as const, default: false }
                        },
                        required: ['pluginId', 'filePath']
                    }
                },
                {
                    name: 'workflow_autonomous_documentation',
                    description: 'Autonomous documentation maintenance: run gap_analysis, optionally generate ADRs and verify ADRs',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            minDependencies: { type: 'number' as const, default: 5 },
                            limit: { type: 'number' as const, default: 20 },
                            generateAdrs: { type: 'boolean' as const, default: false },
                            dryRun: { type: 'boolean' as const, default: true },
                            verifyAdrs: { type: 'boolean' as const, default: false },
                            ensureReady: { type: 'boolean' as const, default: false }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'workflow_co_partner_plan',
                    description: 'Co-Partner workflow: create a structured plan with human checkpoints and rollback guidance',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            changeType: { type: 'string' as const },
                            goal: { type: 'string' as const },
                            targetFiles: {
                                type: 'array' as const,
                                items: { type: 'string' as const }
                            },
                            constraints: {
                                type: 'array' as const,
                                items: { type: 'string' as const }
                            },
                            ensureReady: { type: 'boolean' as const, default: false },
                            limit: { type: 'number' as const, default: 5 }
                        },
                        required: ['pluginId', 'changeType', 'goal']
                    }
                },
                {
                    name: 'workflow_co_partner_feedback',
                    description: 'Co-Partner workflow: interpret human feedback and suggest next action (deterministic heuristics)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            stage: { type: 'string' as const },
                            feedback: { type: 'string' as const }
                        },
                        required: ['stage', 'feedback']
                    }
                },
                {
                    name: 'workflow_co_partner_rollback',
                    description: 'Co-Partner workflow: rollback guidance (commands only; no side effects)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            strategy: { type: 'string' as const, default: 'git' },
                            targetPaths: {
                                type: 'array' as const,
                                items: { type: 'string' as const }
                            }
                        }
                    }
                }
            );

            return { tools };
        });

        const CallToolRequestSchema = z.object({
            method: z.literal('tools/call'),
            params: z.object({
                name: z.string(),
                // Cursor may omit arguments for tool calls.
                arguments: z.any().optional()
            })
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const name = request.params.name;
            const args = request.params.arguments ?? {};

            try {
                // IMPORTANT: Do NOT eagerly initialize on every tool call.
                // Some environments (especially Windows + sqlite3 native bindings) may fail DB initialization.
                // We still want lightweight workflows like workflow/check_status to work.
                const workflowSafeWithoutDbInit = new Set<string>([
                    // Pure filesystem / shell-boundary workflows (no DB manager needed)
                    'workflow_check_status',
                    'workflow_ensure_ready',
                    'workflow_generate_and_ingest',
                    'workflow_full_cycle',
                    'workflow_ingest',
                    // Co-partner helpers are deterministic and do not require DB access
                    'workflow_co_partner_plan',
                    'workflow_co_partner_feedback',
                    'workflow_co_partner_rollback'
                ]);

                const needsDbInit =
                    name.startsWith('query_') ||
                    name === 'cross_analysis' ||
                    name === 'semantic_discovery' ||
                    name === 'system_explanation' ||
                    name === 'learning_path' ||
                    name === 'bootstrap' ||
                    name === 'gap_analysis' ||
                    name === 'architecture_mining' ||
                    name === 'adr_generator' ||
                    name === 'generate_adr' ||
                    (name.startsWith('workflow_') && !workflowSafeWithoutDbInit.has(name));

                if (needsDbInit && !this.initialized) {
                    await this.initialize();
                }

                // Database tools
                if (name.startsWith('query_') || 
                    name === 'cross_analysis' ||
                    name === 'semantic_discovery' ||
                    name === 'system_explanation' ||
                    name === 'learning_path' ||
                    name === 'bootstrap' ||
                    name === 'gap_analysis' ||
                    name === 'architecture_mining' ||
                    name === 'generate_documentation' ||
                    name === 'check_docs_status' ||
                    name === 'adr_generator' ||
                    name === 'generate_adr') {
                    
                    if (!this.databaseAdapter.isAvailable()) {
                        throw new Error('5D Database Plugin is not available');
                    }
                    const requiresDbManager =
                        name !== 'generate_documentation' &&
                        name !== 'check_docs_status';
                    if (requiresDbManager && !this.initialized) {
                        throw new Error(
                            `5D Database Plugin is available but could not be initialized. ` +
                            `Reason: ${this.initializationError ?? 'unknown'}`
                        );
                    }

                    // Resolve plugin ID for all database tools (supports "." for auto-computation)
                    const resolvedPluginId = this.resolvePluginId(args.pluginId);

                    switch (name) {
                        case 'query_modules':
                            const module = await this.databaseTools.queryModules(args.filePath, resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(module, null, 2) }] };

                        case 'query_symbols':
                            const symbols = await this.databaseTools.querySymbols({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(symbols, null, 2) }] };

                        case 'query_dependencies':
                            const deps = await this.databaseTools.queryDependencies({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(deps, null, 2) }] };

                        case 'query_adrs':
                            const adr = await this.databaseTools.queryAdrs(args.adrNumberOrPath, resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(adr, null, 2) }] };

                        case 'query_changes':
                            const changes = await this.databaseTools.queryChanges(resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(changes, null, 2) }] };

                        case 'cross_analysis':
                            const analysis = await this.databaseTools.crossAnalysis(args.filePath, resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }] };

                        case 'semantic_discovery':
                            const discovery = await this.databaseTools.semanticDiscovery({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: discovery }] };

                        case 'system_explanation':
                            const explanation = await this.databaseTools.systemExplanation(resolvedPluginId);
                            return { content: [{ type: 'text', text: explanation }] };

                        case 'learning_path':
                            const learningPath = await this.databaseTools.learningPath(args.topic, resolvedPluginId);
                            return { content: [{ type: 'text', text: learningPath }] };

                        case 'bootstrap':
                            const bootstrap = await this.databaseTools.bootstrap(resolvedPluginId);
                            return { content: [{ type: 'text', text: bootstrap }] };

                        case 'gap_analysis':
                            const gapAnalysis = await this.databaseTools.gapAnalysis({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: gapAnalysis }] };

                        case 'architecture_mining':
                            const architectureMining = await this.databaseTools.architectureMining({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: architectureMining }] };

                        case 'generate_documentation':
                            const generateResult = await this.databaseTools.generateDocumentation(resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(generateResult, null, 2) }] };

                        case 'check_docs_status':
                            const status = await this.databaseTools.checkDocsStatus(resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };

                        case 'adr_generator':
                        case 'generate_adr':
                            const adrGeneratorResult = await this.databaseTools.adrGenerator({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: adrGeneratorResult }] };

                        default:
                            throw new Error(`Unknown database tool: ${name}`);
                    }
                }

                // Validation tools
                if (name.startsWith('validation_')) {
                    if (!this.documentationAdapter.isAvailable()) {
                        throw new Error('Documentation System Plugin is not available');
                    }

                    switch (name) {
                        case 'validation_runScan':
                            const scanResult = await this.validationTools.runScan(args);
                            return { content: [{ type: 'text', text: JSON.stringify(scanResult, null, 2) }] };

                        case 'validation_runValidate':
                            const validateResult = await this.validationTools.runValidate(args);
                            return { content: [{ type: 'text', text: JSON.stringify(validateResult, null, 2) }] };

                        case 'validation_runDriftCheck':
                            const driftResult = await this.validationTools.runDriftCheck(args);
                            return { content: [{ type: 'text', text: JSON.stringify(driftResult, null, 2) }] };

                        case 'validation_analyzeImpact':
                            const impactResult = await this.validationTools.analyzeImpact(args);
                            return { content: [{ type: 'text', text: JSON.stringify(impactResult, null, 2) }] };

                        case 'validation_verifyAdrs':
                            const verifyResult = await this.validationTools.verifyAdrs(args);
                            return { content: [{ type: 'text', text: JSON.stringify(verifyResult, null, 2) }] };

                        default:
                            throw new Error(`Unknown validation tool: ${name}`);
                    }
                }

                // Orchestration tools
                if (name.startsWith('workflow_')) {
                    // Resolve plugin ID for workflow tools (supports "." for auto-computation)
                    const workflowPluginId = this.resolvePluginId(args.pluginId);
                    
                    switch (name) {
                        case 'workflow_full_cycle':
                            const fullCycleResult = await this.orchestrationTools.fullCycle(workflowPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(fullCycleResult, null, 2) }] };

                        case 'workflow_generate_and_ingest':
                            const generateAndIngestResult = await this.orchestrationTools.generateAndIngest(workflowPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(generateAndIngestResult, null, 2) }] };

                        case 'workflow_check_status':
                            const checkStatusResult = await this.orchestrationTools.checkStatus(workflowPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(checkStatusResult, null, 2) }] };

                        case 'workflow_ensure_ready':
                            const ensureReadyResult = await this.orchestrationTools.ensureReady({ pluginId: workflowPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(ensureReadyResult, null, 2) }] };

                        case 'workflow_onboard':
                            const onboardResult = await this.orchestrationTools.onboard({ ...args, pluginId: workflowPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(onboardResult, null, 2) }] };

                        case 'workflow_ingest':
                            if (!this.databaseAdapter.isAvailable()) {
                                throw new Error('5D Database Plugin is not available');
                            }
                            const ingestResult = await this.databaseTools.runIngestion(workflowPluginId, args.full !== false);
                            return { content: [{ type: 'text', text: JSON.stringify(ingestResult, null, 2) }] };

                        case 'workflow_autonomous_feature':
                            const autonomousFeatureResult = await this.orchestrationTools.autonomousFeature({ ...args, pluginId: workflowPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(autonomousFeatureResult, null, 2) }] };

                        case 'workflow_autonomous_refactoring':
                            const autonomousRefactoringResult = await this.orchestrationTools.autonomousRefactoring({ ...args, pluginId: workflowPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(autonomousRefactoringResult, null, 2) }] };

                        case 'workflow_autonomous_documentation':
                            const autonomousDocumentationResult = await this.orchestrationTools.autonomousDocumentation({ ...args, pluginId: workflowPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(autonomousDocumentationResult, null, 2) }] };

                        case 'workflow_co_partner_plan':
                            const coPartnerPlanResult = await this.orchestrationTools.coPartnerPlan({ ...args, pluginId: workflowPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(coPartnerPlanResult, null, 2) }] };

                        case 'workflow_co_partner_feedback':
                            const coPartnerFeedbackResult = await this.orchestrationTools.coPartnerFeedback(args);
                            return { content: [{ type: 'text', text: JSON.stringify(coPartnerFeedbackResult, null, 2) }] };

                        case 'workflow_co_partner_rollback':
                            const coPartnerRollbackResult = await this.orchestrationTools.coPartnerRollback(args);
                            return { content: [{ type: 'text', text: JSON.stringify(coPartnerRollbackResult, null, 2) }] };

                        default:
                            throw new Error(`Unknown orchestration tool: ${name}`);
                    }
                }

                throw new Error(`Unknown tool: ${name}`);
            } catch (error: any) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: error.message || String(error),
                            stack: error.stack
                        }, null, 2)
                    }],
                    isError: true
                };
            }
        });
    }

    /**
     * Resolves plugin ID from provided value or computes it from workspace root.
     * Mirrors 5D Database Plugin's MultiDbManager plugin_id strategy:
     * SHA256(normalized workspaceRoot) → first 16 hex chars.
     * 
     * This ensures compatibility with foreign systems where the plugin ID
     * must be computed deterministically from the workspace root.
     * 
     * @param provided Optional plugin ID (if "." or empty, will be computed)
     * @returns Plugin ID (16 hex characters)
     */
    private resolvePluginId(provided?: string): string {
        const raw = String(provided ?? '').trim();

        // Treat common "alias" values as "compute from workspace root"
        // (foreign systems sometimes pass plugin *names* instead of plugin_id).
        const aliasValues = new Set([
            '.',
            'documentation-system-plugin',
            '@noyrax/documentation-system-plugin',
            '5d-database-plugin',
            '@noyrax/5d-database-plugin'
        ]);

        // Only accept real plugin IDs (16 hex chars). Anything else is treated as an alias.
        const isValidPluginId = (value: string): boolean => /^[0-9a-f]{16}$/i.test(value);

        if (raw && !aliasValues.has(raw)) {
            if (isValidPluginId(raw)) {
                return raw.toLowerCase();
            }
            // fall through → compute
        }

        // Compute plugin ID using same method as 5D Database Plugin
        // SHA256(normalized workspaceRoot) → first 16 hex chars
        const normalizedPath = path.resolve(this.workspaceRoot).replace(/\\/g, '/').toLowerCase();
        const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
        return hash.substring(0, 16);
    }

    /**
     * Starts the MCP server.
     */
    public async start(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}

