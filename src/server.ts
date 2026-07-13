import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WorkspaceResolver } from './workspace-resolver.js';
import { DatabasePluginAdapter } from './plugins/database-plugin-adapter.js';
import { DocumentationPluginAdapter } from './plugins/documentation-plugin-adapter.js';
import { AgentPluginAdapter } from './plugins/agent-plugin-adapter.js';
import { DatabaseTools } from './tools/database-tools.js';
import { ValidationTools } from './tools/validation-tools.js';
import { OrchestrationTools } from './tools/orchestration-tools.js';
import { AgentTools } from './tools/agent-tools.js';
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
    private agentPluginAdapter: AgentPluginAdapter;
    private databaseTools: DatabaseTools;
    private validationTools: ValidationTools;
    private orchestrationTools: OrchestrationTools;
    private agentTools: AgentTools;
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
        this.agentPluginAdapter = new AgentPluginAdapter(workspaceRoot, pluginPaths.agentPlugin);

        // Initialize tools
        this.databaseTools = new DatabaseTools(this.databaseAdapter);
        this.validationTools = new ValidationTools(this.documentationAdapter);
        this.orchestrationTools = new OrchestrationTools(
            this.databaseTools,
            this.validationTools,
            workspaceRoot
        );
        this.agentTools = new AgentTools({ workspaceRoot, adapter: this.agentPluginAdapter });

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
            if (this.agentPluginAdapter.isAvailable()) {
                await this.agentTools.initialize();
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
                    },
                    {
                        name: 'vector_backend_status',
                        description: 'Get vector backend status with reason codes and action hints',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {},
                            required: []
                        }
                    },
                    {
                        name: 'vector_backend_healthcheck',
                        description: 'Perform healthcheck on vector backend (latency, error codes, reason codes)',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {},
                            required: []
                        }
                    },
                    {
                        name: 'source_access_contract',
                        description: 'Get source access contract (deterministic status of code availability)',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                workspaceRoot: { type: 'string' as const }
                            },
                            required: []
                        }
                    },
                    {
                        name: 'source_snippet',
                        description: 'Fetch source code snippet by reference (gated, refs-first)',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                symbol_id: { type: 'string' as const },
                                file_path: { type: 'string' as const },
                                start_line: { type: 'number' as const },
                                end_line: { type: 'number' as const },
                                content_hash: { type: 'string' as const },
                                include_context: { type: 'boolean' as const },
                                context_lines: { type: 'number' as const },
                                verify_hash: { type: 'boolean' as const },
                                pluginId: { type: 'string' as const },
                                workspaceRoot: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    }
                );
            }

            // Validation tools
            // Note: runDriftCheck, analyzeImpact, and verifyAdrs are now local functions
            // and should always be available, even if the plugin is not available.
            // Only runScan and runValidate require the plugin.
            
            // Always register drift, impact, and verifyAdrs (local functions)
                tools.push(
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

            // Only register scan and validate if plugin is available
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
                    description: 'Onboard a foreign codebase: ensure readiness (optional) and return a deterministic onboarding report (Markdown + JSON). Use summaryOnly=true for compact output.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            ensureReady: { type: 'boolean' as const, default: true },
                            summaryOnly: { type: 'boolean' as const, description: 'If true, returns only summary without full details (reduces output size)' },
                            excludeMarkdown: { type: 'boolean' as const, description: 'If true, excludes reportMarkdown from output' },
                            excludeSteps: { type: 'boolean' as const, description: 'If true, excludes detailed steps from output' },
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
                    name: 'workflow_boundary_report',
                    description: 'Get system boundary report: workspace root detection, plugin roots, exclude directories, path normalization rules, and boundary validation. Helps identify workspace boundaries for foreign codebases.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const, description: 'Plugin ID for validation (optional)' },
                            workspaceRoot: { type: 'string' as const, description: 'Override workspace root (optional)' }
                        }
                    }
                },
                {
                    name: 'workflow_path_alias_healing',
                    description: 'Automatically fix path aliases when verifyAdrs reports "src missing" errors. Reads boundary_report, generates alias map (e.g., "src/path/file.ts" -> "plugin/src/path/file.ts"), persists it, and optionally reruns verifyAdrs.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const, description: 'Plugin ID (optional)' },
                            autoFix: { type: 'boolean' as const, description: 'If true, automatically applies fixes and reruns verifyAdrs (default: true)' }
                        }
                    }
                },
                {
                    name: 'workflow_ingest',
                    description: 'Ingest documentation into database (full or incremental). Automatically cleans up old databases with different plugin ID when --full is used and mismatch is detected.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            full: { type: 'boolean' as const, default: true, description: 'Run full ingestion (automatically cleans up old databases if plugin ID mismatch detected)' },
                            cleanup: { type: 'boolean' as const, default: false, description: 'Explicitly cleanup old databases with different plugin ID (optional, auto-cleanup happens on --full if mismatch detected)' }
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
                },
                {
                    name: 'system_contract',
                    description: 'Generate system contract (Integration Contract with versioning, capabilities, canonical IDs). Default mode="refs" returns only reference. Use mode="full" for complete contract or expand=[...] for specific sections.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            mode: { 
                                type: 'string' as const, 
                                enum: ['refs', 'full'],
                                description: 'Output mode: "refs" (default, reference only) or "full" (complete contract, gated)'
                            },
                            expand: {
                                type: 'array' as const,
                                items: { type: 'string' as const },
                                description: 'Specific sections to expand: ["dimensions", "capabilities", "runtime_dependencies", "public_api", "import_map"]'
                            }
                        }
                    }
                },
                {
                    name: 'tools_manifest',
                    description: 'Generate tools manifest. Default mode="refs" returns only reference. Use mode="full" for complete manifest or expand=[...] for specific sections.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            mode: { 
                                type: 'string' as const, 
                                enum: ['refs', 'full'],
                                description: 'Output mode: "refs" (default, reference only) or "full" (complete manifest, gated)'
                            },
                            expand: {
                                type: 'array' as const,
                                items: { type: 'string' as const },
                                description: 'Specific sections to expand: ["tools"]'
                            }
                        }
                    }
                },
                {
                    name: 'onboarding_report',
                    description: 'Generate onboarding report. Default mode="refs" returns only reference. Use mode="full" for complete report.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const },
                            mode: { 
                                type: 'string' as const, 
                                enum: ['refs', 'full'],
                                description: 'Output mode: "refs" (default, reference only) or "full" (complete report, gated)'
                            },
                            reportType: {
                                type: 'string' as const,
                                enum: ['summary', 'full'],
                                description: 'Report type: "summary" (default, compact) or "full" (detailed)'
                            }
                        }
                    }
                },
                {
                    name: 'export_snapshot',
                    description: 'Export system snapshot (contract + dimension slices + checksums). Default mode="refs" returns only reference. Use mode="full" for complete snapshot. Supports full and delta snapshots.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            outputPath: { type: 'string' as const },
                            delta: { type: 'boolean' as const },
                            lastSnapshotHash: { type: 'string' as const },
                            pluginId: { type: 'string' as const },
                            mode: { 
                                type: 'string' as const, 
                                enum: ['refs', 'full'],
                                description: 'Output mode: "refs" (default, reference only) or "full" (complete snapshot, gated)'
                            },
                            expand: {
                                type: 'array' as const,
                                items: { type: 'string' as const },
                                description: 'Specific sections to expand: ["contract", "dimensions", "checksums"]'
                            }
                        }
                    }
                },
                {
                    name: 'snapshot_get',
                    description: 'Get snapshot by artifact ID. Default mode="refs" returns only reference. Use mode="full" for complete snapshot.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            artifactId: { type: 'string' as const },
                            pluginId: { type: 'string' as const },
                            mode: { 
                                type: 'string' as const, 
                                enum: ['refs', 'full'],
                                description: 'Output mode: "refs" (default, reference only) or "full" (complete snapshot, gated)'
                            },
                            expand: {
                                type: 'array' as const,
                                items: { type: 'string' as const },
                                description: 'Specific sections to expand: ["contract", "dimensions", "checksums"]'
                            }
                        },
                        required: ['artifactId']
                    }
                },
                {
                    name: 'import_snapshot',
                    description: 'Import system snapshot. Supports full and delta snapshots.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            snapshotPath: { type: 'string' as const },
                            delta: { type: 'boolean' as const },
                            pluginId: { type: 'string' as const }
                        },
                        required: ['snapshotPath']
                    }
                },
                {
                    name: 'explain_tools',
                    description: 'Get comprehensive guide to all available tools: explanations, workflow patterns, examples, and recommendations. Helps AI agents understand which tools to use and how to combine them.',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            category: {
                                type: 'string' as const,
                                enum: ['database', 'validation', 'orchestration', 'all'],
                                description: 'Filter tools by category (default: all)'
                            },
                            toolName: {
                                type: 'string' as const,
                                description: 'Get detailed information for a specific tool'
                            },
                            useCase: {
                                type: 'string' as const,
                                description: 'Get tool recommendations for a specific use case (e.g., "understand module", "find code", "validate docs")'
                            }
                        }
                    }
                },
                // Agent-5D-System Tools
                {
                    name: 'query_agents',
                    description: 'Query agents by path or agent ID (X-Dimension: Agent structure)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            agentPath: { type: 'string' as const },
                            agentId: { type: 'string' as const },
                            pluginId: { type: 'string' as const }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'query_agent_components',
                    description: 'Query agent components by path or component ID (Y-Dimension: Agent components)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            path: { type: 'string' as const },
                            componentId: { type: 'string' as const },
                            pluginId: { type: 'string' as const }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'query_agent_dependencies',
                    description: 'Query agent dependencies (Z-Dimension: Dependencies between agent components)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            fromAgent: { type: 'string' as const },
                            toAgent: { type: 'string' as const },
                            pluginId: { type: 'string' as const }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'query_agent_decisions',
                    description: 'Query agent decisions (W-Dimension: Agent design decisions, patterns, trade-offs)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            decisionNumberOrPath: { type: 'string' as const },
                            pluginId: { type: 'string' as const }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'query_agent_changes',
                    description: 'Query agent changes (T-Dimension: Agent evolution over time)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            pluginId: { type: 'string' as const }
                        },
                        required: ['pluginId']
                    }
                },
                {
                    name: 'semantic_discovery_agents',
                    description: 'Semantic search over agent patterns (V-Dimension: Semantic search)',
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
                    name: 'cross_analysis_agent',
                    description: 'Cross-dimension analysis for agents (combines X, Y, Z, W, T dimensions)',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            agentPath: { type: 'string' as const },
                            pluginId: { type: 'string' as const }
                        },
                        required: ['agentPath', 'pluginId']
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
                    'workflow_boundary_report',  // Filesystem-only, no DB needed
                    'workflow_path_alias_healing',  // Uses verifyAdrs but doesn't require DB
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
                    name === 'vector_backend_status' ||
                    name === 'vector_backend_healthcheck' ||
                    name === 'source_access_contract' ||
                    name === 'source_snippet' ||
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
                    name === 'generate_adr' ||
                    name === 'vector_backend_status' ||
                    name === 'vector_backend_healthcheck' ||
                    name === 'source_access_contract' ||
                    name === 'source_snippet') {
                    
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
                            // Simple serialization - discovery is already an object, just stringify it
                            const serialized = JSON.stringify(discovery, null, 2);
                            return { content: [{ type: 'text', text: serialized }] };

                        case 'system_explanation':
                            const explanation = await this.databaseTools.systemExplanation(resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(explanation, null, 2) }] };

                        case 'learning_path':
                            const learningPath = await this.databaseTools.learningPath(args.topic, resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(learningPath, null, 2) }] };

                        case 'bootstrap':
                            const bootstrap = await this.databaseTools.bootstrap(resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(bootstrap, null, 2) }] };

                        case 'gap_analysis':
                            const gapAnalysis = await this.databaseTools.gapAnalysis({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(gapAnalysis, null, 2) }] };

                        case 'architecture_mining':
                            const architectureMining = await this.databaseTools.architectureMining({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(architectureMining, null, 2) }] };

                        case 'generate_documentation':
                            const generateResult = await this.databaseTools.generateDocumentation(resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(generateResult, null, 2) }] };

                        case 'check_docs_status':
                            const status = await this.databaseTools.checkDocsStatus(resolvedPluginId);
                            return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };

                        case 'adr_generator':
                        case 'generate_adr':
                            const adrGeneratorResult = await this.databaseTools.adrGenerator({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(adrGeneratorResult, null, 2) }] };

                        case 'vector_backend_status':
                            const vectorStatus = await this.databaseTools.getVectorBackendStatus();
                            return { content: [{ type: 'text', text: JSON.stringify(vectorStatus, null, 2) }] };

                        case 'vector_backend_healthcheck':
                            const vectorHealthcheck = await this.databaseTools.healthcheckVectorBackend();
                            return { content: [{ type: 'text', text: JSON.stringify(vectorHealthcheck, null, 2) }] };

                        case 'source_access_contract':
                            const contract = await this.databaseTools.sourceAccessContract(args);
                            return { content: [{ type: 'text', text: JSON.stringify(contract, null, 2) }] };

                        case 'source_snippet':
                            const snippet = await this.databaseTools.sourceSnippet({ ...args, pluginId: resolvedPluginId });
                            return { content: [{ type: 'text', text: JSON.stringify(snippet, null, 2) }] };

                        default:
                            throw new Error(`Unknown database tool: ${name}`);
                    }
                }

                // Validation tools
                if (name.startsWith('validation_')) {
                    switch (name) {
                        case 'validation_runScan':
                            // Requires plugin availability
                    if (!this.documentationAdapter.isAvailable()) {
                        throw new Error('Documentation System Plugin is not available');
                    }
                            const scanResult = await this.validationTools.runScan(args);
                            return { content: [{ type: 'text', text: JSON.stringify(scanResult, null, 2) }] };

                        case 'validation_runValidate':
                            // Requires plugin availability
                            if (!this.documentationAdapter.isAvailable()) {
                                throw new Error('Documentation System Plugin is not available');
                            }
                            const validateResult = await this.validationTools.runValidate(args);
                            return { content: [{ type: 'text', text: JSON.stringify(validateResult, null, 2) }] };

                        case 'validation_runDriftCheck':
                            // Local function - doesn't require plugin availability
                            const driftResult = await this.validationTools.runDriftCheck(args);
                            return { content: [{ type: 'text', text: JSON.stringify(driftResult, null, 2) }] };

                        case 'validation_analyzeImpact':
                            // Local function - doesn't require plugin availability
                            const impactResult = await this.validationTools.analyzeImpact(args);
                            return { content: [{ type: 'text', text: JSON.stringify(impactResult, null, 2) }] };

                        case 'validation_verifyAdrs':
                            // Uses script - only requires plugin path, not full availability
                            const verifyResult = await this.validationTools.verifyAdrs(args);
                            return { content: [{ type: 'text', text: JSON.stringify(verifyResult, null, 2) }] };

                        default:
                            throw new Error(`Unknown validation tool: ${name}`);
                    }
                }

                // Orchestration tools
                if (name.startsWith('workflow_') || name === 'system_contract' || name === 'tools_manifest' || name === 'onboarding_report' || name === 'export_snapshot' || name === 'snapshot_get' || name === 'import_snapshot' || name === 'explain_tools') {
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

                        case 'workflow_boundary_report':
                            // Import BoundaryReportGenerator dynamically
                            const { BoundaryReportGenerator } = await import('./tools/boundary-report-generator.js');
                            const boundaryGenerator = new BoundaryReportGenerator(this.workspaceRoot);
                            const boundaryResult = await boundaryGenerator.generate({
                                pluginId: workflowPluginId,
                                workspaceRoot: args.workspaceRoot as string | undefined
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(boundaryResult, null, 2) }] };

                        case 'workflow_path_alias_healing':
                            // Import PathAliasHealing dynamically
                            const { PathAliasHealing } = await import('./tools/path-alias-healing.js');
                            const pathAliasHealing = new PathAliasHealing(this.workspaceRoot);
                            const healingResult = await pathAliasHealing.heal({
                                pluginId: workflowPluginId,
                                autoFix: args.autoFix as boolean | undefined,
                                validationTools: this.validationTools
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(healingResult, null, 2) }] };

                        case 'workflow_ingest':
                            if (!this.databaseAdapter.isAvailable()) {
                                throw new Error('5D Database Plugin is not available');
                            }
                            const ingestResult = await this.databaseTools.runIngestion(workflowPluginId, args.full !== false, args.cleanup === true);
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

                        case 'system_contract':
                            const contractResult = await this.orchestrationTools.systemContract({
                                pluginId: workflowPluginId,
                                mode: args.mode as 'refs' | 'full' | undefined,
                                expand: args.expand as string[] | undefined
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(contractResult, null, 2) }] };

                        case 'tools_manifest':
                            const toolsManifestResult = await this.orchestrationTools.toolsManifest({
                                pluginId: workflowPluginId,
                                mode: args.mode as 'refs' | 'full' | undefined,
                                expand: args.expand as string[] | undefined
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(toolsManifestResult, null, 2) }] };

                        case 'onboarding_report':
                            const onboardingReportResult = await this.orchestrationTools.onboardingReport({
                                pluginId: workflowPluginId,
                                mode: args.mode as 'refs' | 'full' | undefined,
                                reportType: args.reportType as 'summary' | 'full' | undefined
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(onboardingReportResult, null, 2) }] };

                        case 'export_snapshot':
                            const exportSnapshotResult = await this.orchestrationTools.exportSnapshot({
                                outputPath: args.outputPath,
                                delta: args.delta,
                                lastSnapshotHash: args.lastSnapshotHash,
                                pluginId: workflowPluginId,
                                mode: args.mode as 'refs' | 'full' | undefined,
                                expand: args.expand as string[] | undefined
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(exportSnapshotResult, null, 2) }] };

                        case 'snapshot_get':
                            const snapshotGetResult = await this.orchestrationTools.snapshotGet({
                                artifactId: args.artifactId as string,
                                pluginId: workflowPluginId,
                                mode: args.mode as 'refs' | 'full' | undefined,
                                expand: args.expand as string[] | undefined
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(snapshotGetResult, null, 2) }] };

                        case 'import_snapshot':
                            if (!args.snapshotPath) {
                                throw new Error('snapshotPath is required for import_snapshot');
                            }
                            const importSnapshotResult = await this.orchestrationTools.importSnapshot({
                                snapshotPath: args.snapshotPath,
                                delta: args.delta,
                                pluginId: workflowPluginId
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(importSnapshotResult, null, 2) }] };

                        case 'explain_tools':
                            // Import ToolGuide dynamically
                            const { ToolGuide } = await import('./tools/tool-guide.js');
                            const toolGuide = new ToolGuide();
                            const explainResult = await toolGuide.explainTools({
                                category: args.category,
                                toolName: args.toolName,
                                useCase: args.useCase
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(explainResult, null, 2) }] };

                        default:
                            throw new Error(`Unknown orchestration tool: ${name}`);
                    }
                }

                // Agent-5D-System Tools (no DB initialization needed initially, will require Agent APIs later)
                if (name.startsWith('query_agent') || name === 'semantic_discovery_agents' || name === 'cross_analysis_agent') {
                    switch (name) {
                        case 'query_agents':
                            const queryAgentsResult = await this.agentTools.queryAgents({
                                agentPath: args.agentPath,
                                agentId: args.agentId,
                                pluginId: args.pluginId
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(queryAgentsResult, null, 2) }] };

                        case 'query_agent_components':
                            const queryComponentsResult = await this.agentTools.queryAgentComponents({
                                path: args.path,
                                componentId: args.componentId,
                                pluginId: args.pluginId
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(queryComponentsResult, null, 2) }] };

                        case 'query_agent_dependencies':
                            const queryDepsResult = await this.agentTools.queryAgentDependencies({
                                fromAgent: args.fromAgent,
                                toAgent: args.toAgent,
                                pluginId: args.pluginId
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(queryDepsResult, null, 2) }] };

                        case 'query_agent_decisions':
                            const queryDecisionsResult = await this.agentTools.queryAgentDecisions({
                                decisionNumberOrPath: args.decisionNumberOrPath,
                                pluginId: args.pluginId
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(queryDecisionsResult, null, 2) }] };

                        case 'query_agent_changes':
                            const queryChangesResult = await this.agentTools.queryAgentChanges({
                                pluginId: args.pluginId
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(queryChangesResult, null, 2) }] };

                        case 'semantic_discovery_agents':
                            const semanticResult = await this.agentTools.semanticDiscoveryAgents({
                                query: args.query,
                                pluginId: args.pluginId,
                                limit: args.limit
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(semanticResult, null, 2) }] };

                        case 'cross_analysis_agent':
                            const crossAnalysisResult = await this.agentTools.crossAnalysisAgent({
                                agentPath: args.agentPath,
                                pluginId: args.pluginId
                            });
                            return { content: [{ type: 'text', text: JSON.stringify(crossAnalysisResult, null, 2) }] };

                        default:
                            throw new Error(`Unknown agent tool: ${name}`);
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
            'default',  // ✅ Fix: Add "default" explicitly
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

