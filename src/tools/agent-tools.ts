/**
 * Agent Tools for MCP Server.
 * Provides structured access to Agent-5D-System databases.
 */

import * as path from 'path';
import { pathToFileURL } from 'url';
import { AgentPluginAdapter } from '../plugins/agent-plugin-adapter';

export interface AgentToolsConfig {
    workspaceRoot: string;
    adapter?: AgentPluginAdapter;
}

export class AgentTools {
    private workspaceRoot: string;
    private adapter?: AgentPluginAdapter;
    private dbManager: any;
    private agentApi: any;
    private componentApi: any;
    private dependencyApi: any;
    private decisionApi: any;
    private changeApi: any;
    private crossDimensionApi: any;

    constructor(config: AgentToolsConfig) {
        this.workspaceRoot = config.workspaceRoot;
        this.adapter = config.adapter;
    }

    /**
     * Initializes Agent APIs.
     */
    public async initialize(): Promise<void> {
        if (!this.adapter) {
            throw new Error('AgentPluginAdapter is required');
        }

        if (!this.adapter.isAvailable()) {
            throw new Error('Agent-5D-System Plugin is not available');
        }

        this.dbManager = await this.adapter.createAgentMultiDbManager();
        
        // Dynamically import APIs
        const pluginPath = this.adapter.getPluginPath();
        if (!pluginPath) {
            throw new Error('Plugin path not found');
        }

        // Import APIs
        const apiPath = path.join(pluginPath, 'out', 'api');
        const agentApiModule = await import(pathToFileURL(path.join(apiPath, 'agent-api.js')).href);
        const componentApiModule = await import(pathToFileURL(path.join(apiPath, 'agent-component-api.js')).href);
        const dependencyApiModule = await import(pathToFileURL(path.join(apiPath, 'agent-dependency-api.js')).href);
        const decisionApiModule = await import(pathToFileURL(path.join(apiPath, 'agent-decision-api.js')).href);
        const changeApiModule = await import(pathToFileURL(path.join(apiPath, 'agent-change-api.js')).href);
        const crossDimensionApiModule = await import(pathToFileURL(path.join(apiPath, 'agent-cross-dimension-api.js')).href);

        this.agentApi = new agentApiModule.AgentApi(this.dbManager);
        this.componentApi = new componentApiModule.AgentComponentApi(this.dbManager);
        this.dependencyApi = new dependencyApiModule.AgentDependencyApi(this.dbManager);
        this.decisionApi = new decisionApiModule.AgentDecisionApi(this.dbManager);
        this.changeApi = new changeApiModule.AgentChangeApi(this.dbManager);
        this.crossDimensionApi = new crossDimensionApiModule.AgentCrossDimensionApi(this.dbManager);
    }

    /**
     * Check if Agent-5D-System is available.
     */
    public async isAvailable(): Promise<boolean> {
        if (!this.adapter) {
            return false;
        }
        return this.adapter.isAvailable();
    }

    /**
     * Query agents by path or agent ID.
     * X-Dimension: Agent structure (n8n workflow, Cursor rule, LangChain chain)
     */
    public async queryAgents(args: {
        agentPath?: string;
        agentId?: string;
        pluginId: string;
    }): Promise<any> {
        if (!this.agentApi) {
            return {
                error: 'Agent-5D-System not initialized',
                message: 'Please call initialize() first.'
            };
        }

        let agent: any = null;
        let evidenceSources: Array<{ type: 'DB_QUERY'; id?: string; path?: string; metadata?: Record<string, any> }> = [];

        if (args.agentId) {
            agent = await this.agentApi.getAgentById(args.agentId, args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                id: args.agentId,
                metadata: { dimension: 'X', pluginId: args.pluginId }
            });
        } else if (args.agentPath) {
            agent = await this.agentApi.getAgentByPath(args.agentPath, args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                path: args.agentPath,
                metadata: { dimension: 'X', pluginId: args.pluginId }
            });
        } else {
            // Return all agents
            const agents = await this.agentApi.getAllAgents(args.pluginId);
            return {
                agents,
                evidence: {
                    grade: 'FACT' as const,
                    sources: [{
                        type: 'DB_QUERY' as const,
                        metadata: { dimension: 'X', pluginId: args.pluginId }
                    }],
                    description: 'All agents from database query'
                }
            };
        }

        // Add evidence
        const evidence = {
            grade: 'FACT' as const,
            sources: evidenceSources,
            description: 'Agent data from database query'
        };

        if (agent === null) {
            return { evidence };
        }

        return {
            ...agent,
            evidence
        };
    }

    /**
     * Query agent components by path or component ID.
     * Y-Dimension: Agent components (nodes, steps, tools, patterns, rules)
     */
    public async queryAgentComponents(args: {
        path?: string;
        componentId?: string;
        pluginId: string;
    }): Promise<any> {
        if (!this.componentApi) {
            return {
                error: 'Agent-5D-System not initialized',
                message: 'Please call initialize() first.'
            };
        }

        let components: any[] = [];
        let evidenceSources: Array<{ type: 'DB_QUERY'; id?: string; path?: string; metadata?: Record<string, any> }> = [];

        if (args.componentId) {
            const component = await this.componentApi.getComponentByComponentId(args.componentId, args.pluginId);
            components = component ? [component] : [];
            evidenceSources.push({
                type: 'DB_QUERY',
                id: args.componentId,
                metadata: { dimension: 'Y', pluginId: args.pluginId }
            });
        } else if (args.path) {
            components = await this.componentApi.getComponentsByAgentPath(args.path, args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                path: args.path,
                metadata: { dimension: 'Y', pluginId: args.pluginId }
            });
        } else {
            components = await this.componentApi.getAllComponents(args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                metadata: { dimension: 'Y', pluginId: args.pluginId }
            });
        }

        // Add evidence
        const evidence = {
            grade: 'FACT' as const,
            sources: evidenceSources,
            description: 'Agent component data from database query'
        };

        return {
            components,
            evidence
        };
    }

    /**
     * Query agent dependencies.
     * Z-Dimension: Dependencies between agent components
     * Note: fromAgent/toAgent parameters need to be mapped to component IDs
     */
    public async queryAgentDependencies(args: {
        fromAgent?: string;
        toAgent?: string;
        pluginId: string;
    }): Promise<any> {
        if (!this.dependencyApi || !this.componentApi) {
            return {
                error: 'Agent-5D-System not initialized',
                message: 'Please call initialize() first.'
            };
        }

        let dependencies: any[] = [];
        let evidenceSources: Array<{ type: 'DB_QUERY'; metadata?: Record<string, any> }> = [];

        if (args.fromAgent || args.toAgent) {
            // Map agent paths to component IDs
            const allComponents = await this.componentApi.getAllComponents(args.pluginId);
            
            if (args.fromAgent) {
                const fromComponents = allComponents.filter((c: any) => c.agent_path === args.fromAgent);
                const fromComponentIds = new Set(fromComponents.map((c: any) => c.component_id));
                
                if (args.toAgent) {
                    const toComponents = allComponents.filter((c: any) => c.agent_path === args.toAgent);
                    const toComponentIds = new Set(toComponents.map((c: any) => c.component_id));
                    
                    // Get dependencies where from is in fromAgent and to is in toAgent
                    const allDeps = await this.dependencyApi.getAllDependencies(args.pluginId);
                    dependencies = allDeps.filter((dep: any) => 
                        fromComponentIds.has(dep.from_component_id) && toComponentIds.has(dep.to_component_id)
                    );
                } else {
                    // Get dependencies from fromAgent
                    const allDeps = await this.dependencyApi.getAllDependencies(args.pluginId);
                    dependencies = allDeps.filter((dep: any) => fromComponentIds.has(dep.from_component_id));
                }
            } else if (args.toAgent) {
                const toComponents = allComponents.filter((c: any) => c.agent_path === args.toAgent);
                const toComponentIds = new Set(toComponents.map((c: any) => c.component_id));
                
                // Get dependencies to toAgent
                const allDeps = await this.dependencyApi.getAllDependencies(args.pluginId);
                dependencies = allDeps.filter((dep: any) => toComponentIds.has(dep.to_component_id));
            }
            
            evidenceSources.push({
                type: 'DB_QUERY',
                metadata: { 
                    dimension: 'Z', 
                    pluginId: args.pluginId,
                    fromAgent: args.fromAgent,
                    toAgent: args.toAgent
                }
            });
        } else {
            dependencies = await this.dependencyApi.getAllDependencies(args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                metadata: { dimension: 'Z', pluginId: args.pluginId }
            });
        }

        // Add evidence
        const evidence = {
            grade: 'FACT' as const,
            sources: evidenceSources,
            description: 'Agent dependency data from database query'
        };

        return {
            dependencies,
            evidence
        };
    }

    /**
     * Query agent decisions.
     * W-Dimension: Agent design decisions, patterns, trade-offs
     */
    public async queryAgentDecisions(args: {
        decisionNumberOrPath?: string;
        pluginId: string;
    }): Promise<any> {
        if (!this.decisionApi) {
            return {
                error: 'Agent-5D-System not initialized',
                message: 'Please call initialize() first.'
            };
        }

        let decisions: any[] = [];
        let evidenceSources: Array<{ type: 'DB_QUERY'; path?: string; metadata?: Record<string, any> }> = [];

        if (args.decisionNumberOrPath) {
            // Try as decision number first
            const decision = await this.decisionApi.getDecisionByNumber(args.decisionNumberOrPath, args.pluginId);
            if (decision) {
                decisions = [decision];
            } else {
                // Try as agent path
                decisions = await this.decisionApi.getDecisionsByAgentPath(args.decisionNumberOrPath, args.pluginId);
            }
            evidenceSources.push({
                type: 'DB_QUERY',
                path: args.decisionNumberOrPath,
                metadata: { dimension: 'W', pluginId: args.pluginId }
            });
        } else {
            decisions = await this.decisionApi.getAllDecisions(args.pluginId);
            evidenceSources.push({
                type: 'DB_QUERY',
                metadata: { dimension: 'W', pluginId: args.pluginId }
            });
        }

        // Add evidence
        const evidence = {
            grade: 'FACT' as const,
            sources: evidenceSources,
            description: 'Agent decision data from database query'
        };

        return {
            decisions,
            evidence
        };
    }

    /**
     * Query agent changes.
     * T-Dimension: Agent evolution over time
     */
    public async queryAgentChanges(args: {
        pluginId: string;
    }): Promise<any> {
        if (!this.changeApi) {
            return {
                error: 'Agent-5D-System not initialized',
                message: 'Please call initialize() first.'
            };
        }

        const changeReports = await this.changeApi.getAllChangeReports(args.pluginId);
        const latestChangeReport = await this.changeApi.getLatestChangeReport(args.pluginId);

        // Add evidence
        const evidence = {
            grade: 'FACT' as const,
            sources: [{
                type: 'DB_QUERY' as const,
                metadata: { dimension: 'T', pluginId: args.pluginId }
            }],
            description: 'Agent change data from database query'
        };

        return {
            changeReports,
            latestChangeReport,
            evidence
        };
    }

    /**
     * Semantic discovery for agents.
     * V-Dimension: Semantic search over agent patterns
     */
    public async semanticDiscoveryAgents(args: {
        query: string;
        pluginId: string;
        limit?: number;
    }): Promise<any> {
        // Placeholder: V-Dimension (Semantic Search) not yet implemented
        return {
            error: 'Semantic search not yet implemented',
            message: 'This tool requires the Agent-5D-System Semantic Brain integration to be implemented first.',
            query: args.query,
            limit: args.limit
        };
    }

    /**
     * Cross-dimension analysis for agents.
     * Combines X, Y, Z, W, T dimensions for a complete agent view.
     */
    public async crossAnalysisAgent(args: {
        agentPath: string;
        pluginId: string;
    }): Promise<any> {
        if (!this.crossDimensionApi) {
            return {
                error: 'Agent-5D-System not initialized',
                message: 'Please call initialize() first.'
            };
        }

        const analysis = await this.crossDimensionApi.getCrossAnalysis(args.agentPath, args.pluginId);

        // Add evidence
        const evidence = {
            grade: 'FACT' as const,
            sources: [{
                type: 'DB_QUERY' as const,
                path: args.agentPath,
                metadata: { dimensions: ['X', 'Y', 'Z', 'W', 'T'], pluginId: args.pluginId }
            }],
            description: 'Cross-dimension analysis from database queries'
        };

        return {
            ...analysis,
            evidence
        };
    }
}
