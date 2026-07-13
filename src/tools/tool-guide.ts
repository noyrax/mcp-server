/**
 * Tool Guide for AI Agents.
 * Provides comprehensive explanations of all available tools, workflow patterns, and recommendations.
 */

export interface ToolInfo {
    name: string;
    description: string;
    category: 'database' | 'validation' | 'orchestration';
    use_cases: string[];
    required_params: string[];
    optional_params: string[];
    examples: Array<{ input: any; description: string }>;
    related_tools: string[];
}

export interface WorkflowPattern {
    name: string;
    description: string;
    steps: Array<{ tool: string; purpose: string }>;
    example: any;
}

export interface ToolRecommendation {
    use_case: string;
    recommended_tools: Array<{ tool: string; reason: string; priority: 'high' | 'medium' | 'low' }>;
    workflow?: WorkflowPattern;
}

export interface ExplainToolsResult {
    summary: {
        total_tools: number;
        categories: Array<{ name: string; count: number }>;
    };
    tools_by_category: {
        database: ToolInfo[];
        validation: ToolInfo[];
        orchestration: ToolInfo[];
    };
    workflow_patterns: WorkflowPattern[];
    tool_recommendations?: ToolRecommendation[];
}

/**
 * Tool Guide generator for AI agents.
 * Helps AI agents understand which tools to use and how to combine them.
 */
export class ToolGuide {
    private tools: ToolInfo[];

    constructor() {
        this.tools = this.buildToolMetadata();
    }

    /**
     * Explains tools based on category, tool name, or use case.
     */
    public explainTools(args: {
        category?: string;
        toolName?: string;
        useCase?: string;
    }): ExplainToolsResult {
        let filteredTools = this.tools;

        // Filter by tool name
        if (args.toolName) {
            filteredTools = filteredTools.filter(t => 
                t.name.toLowerCase().includes(args.toolName!.toLowerCase())
            );
        }

        // Filter by category
        if (args.category && args.category !== 'all') {
            filteredTools = filteredTools.filter(t => t.category === args.category);
        }

        // Build result
        const result: ExplainToolsResult = {
            summary: {
                total_tools: this.tools.length,
                categories: [
                    { name: 'database', count: this.tools.filter(t => t.category === 'database').length },
                    { name: 'validation', count: this.tools.filter(t => t.category === 'validation').length },
                    { name: 'orchestration', count: this.tools.filter(t => t.category === 'orchestration').length }
                ]
            },
            tools_by_category: {
                database: filteredTools.filter(t => t.category === 'database'),
                validation: filteredTools.filter(t => t.category === 'validation'),
                orchestration: filteredTools.filter(t => t.category === 'orchestration')
            },
            workflow_patterns: this.getWorkflowPatterns()
        };

        // Add tool recommendations if use case is specified
        if (args.useCase) {
            result.tool_recommendations = this.getRecommendationsForUseCase(args.useCase);
        }

        return result;
    }

    /**
     * Builds tool metadata from all available tools.
     */
    private buildToolMetadata(): ToolInfo[] {
        return [
            // Database Tools
            {
                name: 'query_modules',
                description: 'Query modules by file path',
                category: 'database',
                use_cases: ['Get module documentation', 'Understand a specific file', 'Get API documentation for a module'],
                required_params: ['filePath', 'pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { filePath: 'src/api/user-service.ts', pluginId: '.' },
                        description: 'Get complete documentation for user-service.ts'
                    }
                ],
                related_tools: ['cross_analysis', 'query_dependencies', 'query_symbols']
            },
            {
                name: 'query_symbols',
                description: 'Query symbols by path or symbol ID',
                category: 'database',
                use_cases: ['Find specific functions', 'Find classes or interfaces', 'Get symbol information'],
                required_params: ['pluginId'],
                optional_params: ['path', 'symbolId'],
                examples: [
                    {
                        input: { path: 'src/api/user-service.ts', pluginId: '.' },
                        description: 'Get all symbols from user-service.ts'
                    },
                    {
                        input: { symbolId: 'ts://src/api/user-service.ts#UserService', pluginId: '.' },
                        description: 'Get specific symbol by ID'
                    }
                ],
                related_tools: ['query_modules', 'cross_analysis']
            },
            {
                name: 'query_dependencies',
                description: 'Query dependencies by module',
                category: 'database',
                use_cases: ['Understand module dependencies', 'Find what depends on a module', 'Analyze dependency graph'],
                required_params: ['pluginId'],
                optional_params: ['fromModule', 'toModule'],
                examples: [
                    {
                        input: { fromModule: 'src/api/user-service.ts', pluginId: '.' },
                        description: 'Get outgoing dependencies from user-service.ts'
                    },
                    {
                        input: { toModule: 'src/core/db-manager.ts', pluginId: '.' },
                        description: 'Get incoming dependencies to db-manager.ts'
                    }
                ],
                related_tools: ['query_modules', 'cross_analysis', 'validation_analyzeImpact']
            },
            {
                name: 'query_adrs',
                description: 'Query ADRs by number or path',
                category: 'database',
                use_cases: ['Get architectural decision record', 'Find ADRs for a file', 'Understand architecture decisions'],
                required_params: ['adrNumberOrPath', 'pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { adrNumberOrPath: '040', pluginId: '.' },
                        description: 'Get ADR-040 by number'
                    },
                    {
                        input: { adrNumberOrPath: 'src/api/context-builder.ts', pluginId: '.' },
                        description: 'Get all ADRs related to context-builder.ts'
                    }
                ],
                related_tools: ['cross_analysis', 'system_explanation', 'validation_verifyAdrs']
            },
            {
                name: 'query_changes',
                description: 'Query change reports',
                category: 'database',
                use_cases: ['See recent changes', 'Understand system evolution', 'Track modifications'],
                required_params: ['pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Get all change reports'
                    }
                ],
                related_tools: ['query_modules', 'query_symbols']
            },
            {
                name: 'cross_analysis',
                description: 'Perform cross-dimension analysis',
                category: 'database',
                use_cases: ['Get complete context for a file', 'Understand module in full context', 'Get ADRs and dependencies together'],
                required_params: ['filePath', 'pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { filePath: 'src/api/context-builder.ts', pluginId: '.' },
                        description: 'Get complete cross-dimension analysis for context-builder.ts'
                    }
                ],
                related_tools: ['query_modules', 'query_adrs', 'query_dependencies', 'query_symbols']
            },
            {
                name: 'semantic_discovery',
                description: 'Semantic search and context retrieval (uses Semantic Brain)',
                category: 'database',
                use_cases: ['Find code by meaning', 'Natural language search', 'Discover related functionality'],
                required_params: ['query', 'pluginId'],
                optional_params: ['limit'],
                examples: [
                    {
                        input: { query: 'How does user authentication work?', pluginId: '.', limit: 10 },
                        description: 'Semantic search for authentication-related code'
                    },
                    {
                        input: { query: 'ContextBuilder implementation', pluginId: '.', limit: 5 },
                        description: 'Find ContextBuilder-related code'
                    }
                ],
                related_tools: ['query_modules', 'query_symbols', 'cross_analysis']
            },
            {
                name: 'system_explanation',
                description: 'Get system overview, entry points, and architecture ADRs',
                category: 'database',
                use_cases: ['Understand system architecture', 'Get entry points', 'See system overview'],
                required_params: ['pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Get complete system explanation'
                    }
                ],
                related_tools: ['bootstrap', 'query_adrs', 'architecture_mining']
            },
            {
                name: 'learning_path',
                description: 'Generate guided learning path for understanding a topic',
                category: 'database',
                use_cases: ['Learn about a specific topic', 'Get learning recommendations', 'Understand complex concepts'],
                required_params: ['topic', 'pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { topic: 'authentication system', pluginId: '.' },
                        description: 'Get learning path for authentication system'
                    }
                ],
                related_tools: ['semantic_discovery', 'system_explanation']
            },
            {
                name: 'bootstrap',
                description: 'Get bootstrap information for first-time system understanding',
                category: 'database',
                use_cases: ['First-time system exploration', 'Onboard new developers', 'Get initial context'],
                required_params: ['pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Get bootstrap information for new system understanding'
                    }
                ],
                related_tools: ['system_explanation', 'workflow_onboard']
            },
            {
                name: 'gap_analysis',
                description: 'Find documentation gaps by analyzing modules with many dependencies but few/no ADRs',
                category: 'database',
                use_cases: ['Find documentation gaps', 'Prioritize documentation work', 'Identify complex modules without ADRs'],
                required_params: ['pluginId'],
                optional_params: ['minDependencies', 'limit', 'autoGenerateAdrs'],
                examples: [
                    {
                        input: { pluginId: '.', minDependencies: 5, limit: 20 },
                        description: 'Find modules with 5+ dependencies but no ADRs'
                    }
                ],
                related_tools: ['adr_generator', 'architecture_mining']
            },
            {
                name: 'architecture_mining',
                description: 'Mine architectural decisions from code structure',
                category: 'database',
                use_cases: ['Discover architecture patterns', 'Understand code structure', 'Extract architectural decisions'],
                required_params: ['pluginId'],
                optional_params: ['filePath'],
                examples: [
                    {
                        input: { pluginId: '.', filePath: 'src/api/context-builder.ts' },
                        description: 'Mine architecture patterns from context-builder.ts'
                    },
                    {
                        input: { pluginId: '.' },
                        description: 'Mine architecture patterns system-wide'
                    }
                ],
                related_tools: ['gap_analysis', 'system_explanation', 'query_adrs']
            },
            {
                name: 'generate_documentation',
                description: 'Generate documentation using Noyrax',
                category: 'database',
                use_cases: ['Generate docs/', 'Create documentation', 'Update documentation'],
                required_params: ['pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Generate complete documentation'
                    }
                ],
                related_tools: ['workflow_full_cycle', 'check_docs_status']
            },
            {
                name: 'check_docs_status',
                description: 'Check if docs/ directory exists and is up-to-date',
                category: 'database',
                use_cases: ['Verify documentation exists', 'Check documentation status'],
                required_params: ['pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Check if docs/ exists and is current'
                    }
                ],
                related_tools: ['workflow_check_status', 'generate_documentation']
            },
            {
                name: 'adr_generator',
                description: 'Reconstruct ADRs from 5D dimensions for modules with documentation gaps',
                category: 'database',
                use_cases: ['Generate ADRs automatically', 'Fill documentation gaps', 'Create ADRs from code'],
                required_params: ['pluginId'],
                optional_params: ['minDependencies', 'limit', 'dryRun', 'useLLM', 'llmModel'],
                examples: [
                    {
                        input: { pluginId: '.', minDependencies: 5, limit: 10, dryRun: true },
                        description: 'Generate ADRs in dry-run mode'
                    }
                ],
                related_tools: ['gap_analysis', 'validation_verifyAdrs']
            },
            {
                name: 'generate_adr',
                description: 'Alias for adr_generator',
                category: 'database',
                use_cases: ['Generate ADRs automatically', 'Fill documentation gaps'],
                required_params: ['pluginId'],
                optional_params: ['minDependencies', 'limit', 'dryRun', 'useLLM', 'llmModel'],
                examples: [
                    {
                        input: { pluginId: '.', minDependencies: 5, limit: 10, dryRun: true },
                        description: 'Generate ADRs in dry-run mode (alias)'
                    }
                ],
                related_tools: ['adr_generator', 'gap_analysis']
            },
            {
                name: 'vector_backend_status',
                description: 'Get vector backend status with reason codes and action hints',
                category: 'database',
                use_cases: ['Check embedding backend status', 'Diagnose semantic search issues'],
                required_params: [],
                optional_params: [],
                examples: [
                    {
                        input: {},
                        description: 'Get vector backend status'
                    }
                ],
                related_tools: ['semantic_discovery', 'vector_backend_healthcheck']
            },
            {
                name: 'vector_backend_healthcheck',
                description: 'Perform healthcheck on vector backend',
                category: 'database',
                use_cases: ['Health check for embeddings', 'Test vector backend'],
                required_params: [],
                optional_params: [],
                examples: [
                    {
                        input: {},
                        description: 'Perform vector backend healthcheck'
                    }
                ],
                related_tools: ['vector_backend_status', 'semantic_discovery']
            },
            {
                name: 'source_access_contract',
                description: 'Get source access contract (deterministic status of code availability)',
                category: 'database',
                use_cases: ['Check source code availability', 'Verify source access'],
                required_params: [],
                optional_params: ['workspaceRoot'],
                examples: [
                    {
                        input: { workspaceRoot: '.' },
                        description: 'Get source access contract'
                    }
                ],
                related_tools: ['source_snippet']
            },
            {
                name: 'source_snippet',
                description: 'Fetch source code snippet by reference',
                category: 'database',
                use_cases: ['Get source code snippets', 'Read code by reference'],
                required_params: ['pluginId'],
                optional_params: ['symbol_id', 'file_path', 'start_line', 'end_line', 'content_hash', 'include_context', 'context_lines', 'verify_hash', 'workspaceRoot'],
                examples: [
                    {
                        input: { pluginId: '.', file_path: 'src/api/context-builder.ts', start_line: 1, end_line: 50 },
                        description: 'Get source code snippet from context-builder.ts'
                    }
                ],
                related_tools: ['source_access_contract', 'query_symbols']
            },

            // Validation Tools
            {
                name: 'validation_runScan',
                description: 'Run documentation scan',
                category: 'validation',
                use_cases: ['Scan codebase for documentation', 'Generate documentation metadata', 'Update documentation index'],
                required_params: [],
                optional_params: ['files', 'incremental'],
                examples: [
                    {
                        input: { incremental: true },
                        description: 'Run incremental scan (only changed files)'
                    },
                    {
                        input: { files: ['src/api/user-service.ts'], incremental: false },
                        description: 'Scan specific files'
                    }
                ],
                related_tools: ['validation_runValidate', 'generate_documentation', 'workflow_full_cycle']
            },
            {
                name: 'validation_runValidate',
                description: 'Run documentation validation',
                category: 'validation',
                use_cases: ['Validate documentation consistency', 'Check documentation quality', 'Verify documentation completeness'],
                required_params: [],
                optional_params: ['files', 'verbose'],
                examples: [
                    {
                        input: { verbose: false },
                        description: 'Run validation without verbose output'
                    },
                    {
                        input: { files: ['src/api/'], verbose: true },
                        description: 'Validate specific files with verbose output'
                    }
                ],
                related_tools: ['validation_runScan', 'validation_runDriftCheck', 'workflow_full_cycle']
            },
            {
                name: 'validation_runDriftCheck',
                description: 'Check for drift between code and documentation',
                category: 'validation',
                use_cases: ['Detect documentation drift', 'Find outdated documentation', 'Check code-doc consistency'],
                required_params: [],
                optional_params: ['since'],
                examples: [
                    {
                        input: { since: '2024-01-01' },
                        description: 'Check for drift since specific date'
                    },
                    {
                        input: {},
                        description: 'Check for all drift'
                    }
                ],
                related_tools: ['validation_runValidate', 'validation_analyzeImpact']
            },
            {
                name: 'validation_analyzeImpact',
                description: 'Analyze impact of changes to a file or symbol',
                category: 'validation',
                use_cases: ['Understand change impact', 'Find affected modules', 'Analyze breaking changes'],
                required_params: ['file'],
                optional_params: ['symbol'],
                examples: [
                    {
                        input: { file: 'src/api/user-service.ts' },
                        description: 'Analyze impact of changes to user-service.ts'
                    },
                    {
                        input: { file: 'src/api/user-service.ts', symbol: 'UserService' },
                        description: 'Analyze impact of changes to UserService class'
                    }
                ],
                related_tools: ['query_dependencies', 'validation_runDriftCheck']
            },
            {
                name: 'validation_verifyAdrs',
                description: 'Verify ADR claims against code',
                category: 'validation',
                use_cases: ['Verify ADR accuracy', 'Check ADR claims', 'Validate ADR documentation'],
                required_params: [],
                optional_params: ['verbose'],
                examples: [
                    {
                        input: { verbose: false },
                        description: 'Verify ADRs without verbose output'
                    },
                    {
                        input: { verbose: true },
                        description: 'Verify ADRs with detailed output'
                    }
                ],
                related_tools: ['query_adrs', 'validation_runValidate']
            },

            // Orchestration Tools
            {
                name: 'workflow_full_cycle',
                description: 'Full workflow: Scan → Generate → Validate → Ingest → Embeddings',
                category: 'orchestration',
                use_cases: ['Complete documentation workflow', 'Full system update', 'Generate and ingest everything'],
                required_params: ['pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Run complete documentation workflow'
                    }
                ],
                related_tools: ['workflow_generate_and_ingest', 'workflow_check_status']
            },
            {
                name: 'workflow_generate_and_ingest',
                description: 'Generate documentation and ingest into database',
                category: 'orchestration',
                use_cases: ['Generate and ingest docs', 'Update databases after generation'],
                required_params: ['pluginId'],
                optional_params: [],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Generate documentation and ingest into databases'
                    }
                ],
                related_tools: ['generate_documentation', 'workflow_ingest', 'workflow_full_cycle']
            },
            {
                name: 'workflow_check_status',
                description: 'Check system status (docs/, databases, embeddings)',
                category: 'orchestration',
                use_cases: ['Diagnose system health', 'Verify installation', 'Check system readiness'],
                required_params: [],
                optional_params: ['pluginId'],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Check complete system status'
                    }
                ],
                related_tools: ['workflow_ensure_ready', 'check_docs_status']
            },
            {
                name: 'workflow_ensure_ready',
                description: 'Best-effort: ensure docs/ and databases exist',
                category: 'orchestration',
                use_cases: ['Setup system automatically', 'Ensure system is ready', 'One-call setup helper'],
                required_params: [],
                optional_params: ['pluginId'],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Ensure system is ready (generate docs and ingest if needed)'
                    }
                ],
                related_tools: ['workflow_check_status', 'workflow_onboard']
            },
            {
                name: 'workflow_onboard',
                description: 'Onboard a foreign codebase: ensure readiness and return onboarding report',
                category: 'orchestration',
                use_cases: ['Onboard new codebase', 'Get system overview', 'First-time setup'],
                required_params: [],
                optional_params: ['pluginId', 'ensureReady', 'summaryOnly', 'excludeMarkdown', 'excludeSteps', 'semanticQueries', 'semanticLimit', 'gapMinDependencies', 'gapLimit'],
                examples: [
                    {
                        input: { pluginId: '.', ensureReady: true, summaryOnly: false },
                        description: 'Complete onboarding with full report'
                    },
                    {
                        input: { pluginId: '.', summaryOnly: true },
                        description: 'Quick onboarding summary'
                    }
                ],
                related_tools: ['bootstrap', 'system_explanation', 'workflow_ensure_ready']
            },
            {
                name: 'workflow_boundary_report',
                description: 'Get system boundary report: workspace root detection, plugin roots, exclude directories, path normalization rules, and boundary validation. Helps identify workspace boundaries for foreign codebases.',
                category: 'orchestration',
                use_cases: ['Identify workspace boundaries', 'Detect plugin roots in Monorepo', 'Validate workspace root', 'Get path normalization rules', 'Check exclude directories'],
                required_params: [],
                optional_params: ['pluginId', 'workspaceRoot'],
                examples: [
                    {
                        input: { pluginId: '.' },
                        description: 'Get boundary report for current workspace'
                    },
                    {
                        input: { pluginId: '.', workspaceRoot: '/path/to/workspace' },
                        description: 'Get boundary report with workspace root override'
                    }
                ],
                related_tools: ['workflow_check_status', 'workflow_onboard', 'system_contract']
            },
            {
                name: 'workflow_ingest',
                description: 'Ingest documentation into database (full or incremental)',
                category: 'orchestration',
                use_cases: ['Update databases', 'Sync documentation to databases', 'Refresh database content'],
                required_params: ['pluginId'],
                optional_params: ['full', 'cleanup'],
                examples: [
                    {
                        input: { pluginId: '.', full: true },
                        description: 'Full ingestion (recreate all databases)'
                    },
                    {
                        input: { pluginId: '.', full: false },
                        description: 'Incremental ingestion (only changes)'
                    }
                ],
                related_tools: ['workflow_generate_and_ingest', 'generate_documentation']
            },
            {
                name: 'workflow_autonomous_feature',
                description: 'Autonomous feature workflow: collect context and return structured plan',
                category: 'orchestration',
                use_cases: ['Plan new feature', 'Collect context for implementation', 'Get implementation guidance'],
                required_params: ['pluginId', 'requirement'],
                optional_params: ['limit', 'candidateFiles', 'ensureReady'],
                examples: [
                    {
                        input: { pluginId: '.', requirement: 'Add user authentication', limit: 5 },
                        description: 'Get feature implementation plan for user authentication'
                    }
                ],
                related_tools: ['semantic_discovery', 'bootstrap', 'system_explanation']
            },
            {
                name: 'workflow_autonomous_refactoring',
                description: 'Autonomous refactoring workflow: impact analysis and verification checklist',
                category: 'orchestration',
                use_cases: ['Plan refactoring', 'Analyze refactoring impact', 'Get refactoring checklist'],
                required_params: ['pluginId', 'filePath', 'goal'],
                optional_params: ['ensureReady'],
                examples: [
                    {
                        input: { pluginId: '.', filePath: 'src/api/user-service.ts', goal: 'Extract authentication logic' },
                        description: 'Get refactoring plan for extracting authentication'
                    }
                ],
                related_tools: ['validation_analyzeImpact', 'query_dependencies', 'cross_analysis']
            },
            {
                name: 'workflow_autonomous_documentation',
                description: 'Autonomous documentation maintenance: run gap_analysis, optionally generate ADRs',
                category: 'orchestration',
                use_cases: ['Maintain documentation', 'Fill documentation gaps', 'Generate missing ADRs'],
                required_params: ['pluginId'],
                optional_params: ['minDependencies', 'limit', 'generateAdrs', 'dryRun', 'verifyAdrs', 'ensureReady'],
                examples: [
                    {
                        input: { pluginId: '.', minDependencies: 5, limit: 20, generateAdrs: false, dryRun: true },
                        description: 'Analyze documentation gaps without generating ADRs'
                    }
                ],
                related_tools: ['gap_analysis', 'adr_generator', 'validation_verifyAdrs']
            },
            {
                name: 'workflow_co_partner_plan',
                description: 'Co-Partner workflow: create structured plan with human checkpoints',
                category: 'orchestration',
                use_cases: ['Plan changes with human review', 'Create structured implementation plan', 'Get rollback guidance'],
                required_params: ['pluginId', 'changeType', 'goal'],
                optional_params: ['targetFiles', 'constraints', 'ensureReady', 'limit'],
                examples: [
                    {
                        input: { pluginId: '.', changeType: 'refactor', goal: 'Extract authentication service', targetFiles: ['src/api/user-service.ts'] },
                        description: 'Create co-partner plan for refactoring'
                    }
                ],
                related_tools: ['workflow_autonomous_refactoring', 'validation_analyzeImpact']
            },
            {
                name: 'workflow_co_partner_feedback',
                description: 'Co-Partner workflow: interpret human feedback and suggest next action',
                category: 'orchestration',
                use_cases: ['Process human feedback', 'Get next action based on feedback', 'Continue workflow after review'],
                required_params: ['stage', 'feedback'],
                optional_params: [],
                examples: [
                    {
                        input: { stage: 'implementation', feedback: 'The approach looks good, proceed with extraction' },
                        description: 'Process feedback and get next action'
                    }
                ],
                related_tools: ['workflow_co_partner_plan']
            },
            {
                name: 'workflow_co_partner_rollback',
                description: 'Co-Partner workflow: rollback guidance (commands only)',
                category: 'orchestration',
                use_cases: ['Get rollback instructions', 'Undo changes', 'Revert implementation'],
                required_params: [],
                optional_params: ['strategy', 'targetPaths'],
                examples: [
                    {
                        input: { strategy: 'git', targetPaths: ['src/api/user-service.ts'] },
                        description: 'Get git rollback commands for specific files'
                    }
                ],
                related_tools: ['workflow_co_partner_plan']
            },
            {
                name: 'system_contract',
                description: 'Generate system contract (Integration Contract with versioning, capabilities, canonical IDs)',
                category: 'orchestration',
                use_cases: ['Get system contract', 'Understand system capabilities', 'Export system metadata'],
                required_params: [],
                optional_params: ['pluginId', 'mode', 'expand'],
                examples: [
                    {
                        input: { pluginId: '.', mode: 'refs' },
                        description: 'Get system contract reference'
                    }
                ],
                related_tools: ['tools_manifest', 'onboarding_report']
            },
            {
                name: 'tools_manifest',
                description: 'Generate tools manifest',
                category: 'orchestration',
                use_cases: ['Get tools manifest', 'List all available tools', 'Export tool metadata'],
                required_params: [],
                optional_params: ['pluginId', 'mode', 'expand'],
                examples: [
                    {
                        input: { pluginId: '.', mode: 'refs' },
                        description: 'Get tools manifest reference'
                    }
                ],
                related_tools: ['system_contract', 'explain_tools']
            },
            {
                name: 'onboarding_report',
                description: 'Generate onboarding report',
                category: 'orchestration',
                use_cases: ['Get onboarding report', 'System overview report', 'Export onboarding information'],
                required_params: [],
                optional_params: ['pluginId', 'mode', 'reportType'],
                examples: [
                    {
                        input: { pluginId: '.', mode: 'refs', reportType: 'summary' },
                        description: 'Get onboarding report summary'
                    }
                ],
                related_tools: ['workflow_onboard', 'system_contract']
            },
            {
                name: 'export_snapshot',
                description: 'Export system snapshot (contract + dimension slices + checksums)',
                category: 'orchestration',
                use_cases: ['Export system state', 'Create system backup', 'Share system state'],
                required_params: ['snapshotPath'],
                optional_params: ['pluginId', 'delta', 'lastSnapshotHash', 'mode', 'expand'],
                examples: [
                    {
                        input: { pluginId: '.', outputPath: 'snapshot.json', mode: 'refs' },
                        description: 'Export system snapshot reference'
                    }
                ],
                related_tools: ['import_snapshot', 'system_contract']
            },
            {
                name: 'snapshot_get',
                description: 'Get snapshot by artifact ID',
                category: 'orchestration',
                use_cases: ['Retrieve snapshot', 'Get system state by ID'],
                required_params: ['artifactId'],
                optional_params: ['pluginId', 'mode', 'expand'],
                examples: [
                    {
                        input: { artifactId: 'abc123', pluginId: '.', mode: 'refs' },
                        description: 'Get snapshot by artifact ID'
                    }
                ],
                related_tools: ['export_snapshot', 'import_snapshot']
            },
            {
                name: 'import_snapshot',
                description: 'Import system snapshot',
                category: 'orchestration',
                use_cases: ['Import system state', 'Restore from backup', 'Load shared system state'],
                required_params: ['snapshotPath'],
                optional_params: ['pluginId', 'delta'],
                examples: [
                    {
                        input: { pluginId: '.', snapshotPath: 'snapshot.json' },
                        description: 'Import system snapshot'
                    }
                ],
                related_tools: ['export_snapshot', 'snapshot_get']
            }
        ];
    }

    /**
     * Gets workflow patterns.
     */
    private getWorkflowPatterns(): WorkflowPattern[] {
        return [
            {
                name: 'Onboarding',
                description: 'Fast onboarding for foreign codebase',
                steps: [
                    { tool: 'workflow_onboard', purpose: 'Get complete onboarding report with system overview' }
                ],
                example: {
                    tool: 'workflow_onboard',
                    arguments: { pluginId: '.', ensureReady: true, summaryOnly: false }
                }
            },
            {
                name: 'First-Time System Understanding',
                description: 'Understand system architecture and entry points',
                steps: [
                    { tool: 'bootstrap', purpose: 'Get initial system context' },
                    { tool: 'system_explanation', purpose: 'Get system overview and architecture' },
                    { tool: 'semantic_discovery', purpose: 'Find main entry points' }
                ],
                example: {
                    sequence: [
                        { tool: 'bootstrap', arguments: { pluginId: '.' } },
                        { tool: 'system_explanation', arguments: { pluginId: '.' } },
                        { tool: 'semantic_discovery', arguments: { query: 'main entry point', pluginId: '.', limit: 5 } }
                    ]
                }
            },
            {
                name: 'Understanding a Module',
                description: 'Get complete understanding of a specific module',
                steps: [
                    { tool: 'query_modules', purpose: 'Get module documentation' },
                    { tool: 'cross_analysis', purpose: 'Get cross-dimension context (ADRs, dependencies, symbols)' },
                    { tool: 'query_dependencies', purpose: 'Get dependency relationships' }
                ],
                example: {
                    sequence: [
                        { tool: 'query_modules', arguments: { filePath: 'src/api/user-service.ts', pluginId: '.' } },
                        { tool: 'cross_analysis', arguments: { filePath: 'src/api/user-service.ts', pluginId: '.' } },
                        { tool: 'query_dependencies', arguments: { fromModule: 'src/api/user-service.ts', pluginId: '.' } }
                    ]
                }
            },
            {
                name: 'Finding Code by Meaning',
                description: 'Find code using natural language queries',
                steps: [
                    { tool: 'semantic_discovery', purpose: 'Search semantically for relevant code' }
                ],
                example: {
                    tool: 'semantic_discovery',
                    arguments: { query: 'How does user authentication work?', pluginId: '.', limit: 10 }
                }
            },
            {
                name: 'Documentation Workflow',
                description: 'Complete documentation generation and ingestion',
                steps: [
                    { tool: 'workflow_check_status', purpose: 'Check current system status' },
                    { tool: 'generate_documentation', purpose: 'Generate docs/ directory' },
                    { tool: 'validation_runValidate', purpose: 'Validate documentation' },
                    { tool: 'workflow_ingest', purpose: 'Ingest into databases' }
                ],
                example: {
                    sequence: [
                        { tool: 'workflow_check_status', arguments: { pluginId: '.' } },
                        { tool: 'generate_documentation', arguments: { pluginId: '.' } },
                        { tool: 'validation_runValidate', arguments: {} },
                        { tool: 'workflow_ingest', arguments: { pluginId: '.', full: true } }
                    ]
                }
            },
            {
                name: 'Impact Analysis',
                description: 'Analyze impact of changes to a file',
                steps: [
                    { tool: 'validation_analyzeImpact', purpose: 'Analyze change impact' },
                    { tool: 'query_dependencies', purpose: 'Get dependency context' }
                ],
                example: {
                    sequence: [
                        { tool: 'validation_analyzeImpact', arguments: { file: 'src/api/user-service.ts' } },
                        { tool: 'query_dependencies', arguments: { fromModule: 'src/api/user-service.ts', pluginId: '.' } }
                    ]
                }
            },
            {
                name: 'ADR Verification',
                description: 'Verify ADR claims against code',
                steps: [
                    { tool: 'validation_verifyAdrs', purpose: 'Verify ADR claims' },
                    { tool: 'query_adrs', purpose: 'Get ADR details if needed' }
                ],
                example: {
                    sequence: [
                        { tool: 'validation_verifyAdrs', arguments: { verbose: false } },
                        { tool: 'query_adrs', arguments: { adrNumberOrPath: '040', pluginId: '.' } }
                    ]
                }
            }
        ];
    }

    /**
     * Gets tool recommendations for a use case.
     */
    private getRecommendationsForUseCase(useCase: string): ToolRecommendation[] {
        const useCaseLower = useCase.toLowerCase();

        const recommendations: Record<string, ToolRecommendation> = {
            'understand_module': {
                use_case: 'understand_module',
                recommended_tools: [
                    { tool: 'query_modules', reason: 'Get module documentation and API', priority: 'high' },
                    { tool: 'cross_analysis', reason: 'Get complete context including ADRs and dependencies', priority: 'high' },
                    { tool: 'query_dependencies', reason: 'Understand module relationships', priority: 'medium' },
                    { tool: 'query_symbols', reason: 'Get detailed symbol information', priority: 'low' }
                ],
                workflow: this.getWorkflowPatterns().find(p => p.name === 'Understanding a Module')
            },
            'find_code': {
                use_case: 'find_code',
                recommended_tools: [
                    { tool: 'semantic_discovery', reason: 'Natural language search for code', priority: 'high' },
                    { tool: 'query_symbols', reason: 'Find specific symbols by name or ID', priority: 'medium' },
                    { tool: 'query_modules', reason: 'Browse modules by file path', priority: 'low' }
                ],
                workflow: this.getWorkflowPatterns().find(p => p.name === 'Finding Code by Meaning')
            },
            'validate_docs': {
                use_case: 'validate_docs',
                recommended_tools: [
                    { tool: 'validation_runValidate', reason: 'Validate documentation consistency', priority: 'high' },
                    { tool: 'validation_runDriftCheck', reason: 'Check for documentation drift', priority: 'high' },
                    { tool: 'validation_verifyAdrs', reason: 'Verify ADR claims', priority: 'medium' }
                ],
                workflow: this.getWorkflowPatterns().find(p => p.name === 'Documentation Workflow')
            },
            'understand_architecture': {
                use_case: 'understand_architecture',
                recommended_tools: [
                    { tool: 'system_explanation', reason: 'Get system overview and architecture', priority: 'high' },
                    { tool: 'query_adrs', reason: 'Read architectural decision records', priority: 'high' },
                    { tool: 'architecture_mining', reason: 'Discover architecture patterns from code', priority: 'medium' },
                    { tool: 'bootstrap', reason: 'Get initial system context', priority: 'low' }
                ],
                workflow: this.getWorkflowPatterns().find(p => p.name === 'First-Time System Understanding')
            },
            'onboard_codebase': {
                use_case: 'onboard_codebase',
                recommended_tools: [
                    { tool: 'workflow_onboard', reason: 'Complete onboarding workflow with report', priority: 'high' },
                    { tool: 'bootstrap', reason: 'Get initial system context', priority: 'medium' },
                    { tool: 'workflow_ensure_ready', reason: 'Ensure system is ready for use', priority: 'medium' }
                ],
                workflow: this.getWorkflowPatterns().find(p => p.name === 'Onboarding')
            },
            'analyze_impact': {
                use_case: 'analyze_impact',
                recommended_tools: [
                    { tool: 'validation_analyzeImpact', reason: 'Analyze change impact on dependencies', priority: 'high' },
                    { tool: 'query_dependencies', reason: 'Get detailed dependency information', priority: 'high' },
                    { tool: 'cross_analysis', reason: 'Get complete context for impact analysis', priority: 'medium' }
                ],
                workflow: this.getWorkflowPatterns().find(p => p.name === 'Impact Analysis')
            },
            'generate_docs': {
                use_case: 'generate_docs',
                recommended_tools: [
                    { tool: 'workflow_full_cycle', reason: 'Complete workflow: scan, generate, validate, ingest', priority: 'high' },
                    { tool: 'validation_runScan', reason: 'Scan codebase for documentation', priority: 'medium' },
                    { tool: 'generate_documentation', reason: 'Generate documentation files', priority: 'medium' },
                    { tool: 'workflow_generate_and_ingest', reason: 'Generate and ingest in one step', priority: 'medium' }
                ],
                workflow: this.getWorkflowPatterns().find(p => p.name === 'Documentation Workflow')
            }
        };

        // Try to find exact match
        if (recommendations[useCaseLower]) {
            return [recommendations[useCaseLower]];
        }

        // Try partial matches
        const matchingKeys = Object.keys(recommendations).filter(key => 
            useCaseLower.includes(key) || key.includes(useCaseLower)
        );

        if (matchingKeys.length > 0) {
            return matchingKeys.map(key => recommendations[key]);
        }

        // Return all recommendations if no match
        return Object.values(recommendations);
    }
}

