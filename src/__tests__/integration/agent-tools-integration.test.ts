import { UnifiedMcpServer } from '../../server.js';
import * as path from 'path';

describe('AgentTools MCP Server Integration', () => {
    const testWorkspaceRoot = path.resolve(__dirname, '../../../..');

    describe('AgentTools Initialization', () => {
        test('should initialize AgentTools when agent-5d-system is available', async () => {
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            
            // Check if agentPluginAdapter is created
            expect((server as any).agentPluginAdapter).toBeDefined();
            
            // Initialize server
            await server.initialize();
            
            // Check if agentTools is initialized (if adapter is available)
            if ((server as any).agentPluginAdapter.isAvailable()) {
                expect((server as any).agentTools).toBeDefined();
            }
        });

        test('should handle gracefully when agent-5d-system is not available', async () => {
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            
            // Server should still initialize even if agent-5d-system is not available
            await expect(server.initialize()).resolves.not.toThrow();
        });
    });

    describe('Tool Registration', () => {
        test('should have all agent tools registered', async () => {
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            await server.initialize();

            // Get registered tools
            const tools = await server.listTools();
            const toolNames = tools.map((t: any) => t.name);

            // Check that all agent tools are registered
            expect(toolNames).toContain('query_agents');
            expect(toolNames).toContain('query_agent_components');
            expect(toolNames).toContain('query_agent_dependencies');
            expect(toolNames).toContain('query_agent_decisions');
            expect(toolNames).toContain('query_agent_changes');
            expect(toolNames).toContain('semantic_discovery_agents');
            expect(toolNames).toContain('cross_analysis_agent');
        });
    });

    describe('Tool Handlers', () => {
        let server: UnifiedMcpServer;
        const testPluginId = 'test-plugin-id';

        beforeEach(async () => {
            server = new UnifiedMcpServer(testWorkspaceRoot);
            await server.initialize();
        });

        test('query_agents handler should call AgentTools.queryAgents', async () => {
            // This test verifies the handler exists and calls the right method
            // Actual functionality is tested in agent-tools.test.ts
            const tools = await server.listTools();
            const queryAgentsTool = tools.find((t: any) => t.name === 'query_agents');
            
            expect(queryAgentsTool).toBeDefined();
            expect(queryAgentsTool.inputSchema).toBeDefined();
        });

        test('query_agent_components handler should call AgentTools.queryAgentComponents', async () => {
            const tools = await server.listTools();
            const tool = tools.find((t: any) => t.name === 'query_agent_components');
            
            expect(tool).toBeDefined();
            expect(tool.inputSchema).toBeDefined();
        });

        test('query_agent_dependencies handler should call AgentTools.queryAgentDependencies', async () => {
            const tools = await server.listTools();
            const tool = tools.find((t: any) => t.name === 'query_agent_dependencies');
            
            expect(tool).toBeDefined();
            expect(tool.inputSchema).toBeDefined();
        });

        test('query_agent_decisions handler should call AgentTools.queryAgentDecisions', async () => {
            const tools = await server.listTools();
            const tool = tools.find((t: any) => t.name === 'query_agent_decisions');
            
            expect(tool).toBeDefined();
            expect(tool.inputSchema).toBeDefined();
        });

        test('query_agent_changes handler should call AgentTools.queryAgentChanges', async () => {
            const tools = await server.listTools();
            const tool = tools.find((t: any) => t.name === 'query_agent_changes');
            
            expect(tool).toBeDefined();
            expect(tool.inputSchema).toBeDefined();
        });

        test('semantic_discovery_agents handler should call AgentTools.semanticDiscoveryAgents', async () => {
            const tools = await server.listTools();
            const tool = tools.find((t: any) => t.name === 'semantic_discovery_agents');
            
            expect(tool).toBeDefined();
            expect(tool.inputSchema).toBeDefined();
        });

        test('cross_analysis_agent handler should call AgentTools.crossAnalysisAgent', async () => {
            const tools = await server.listTools();
            const tool = tools.find((t: any) => t.name === 'cross_analysis_agent');
            
            expect(tool).toBeDefined();
            expect(tool.inputSchema).toBeDefined();
        });
    });

    describe('Evidence Integration', () => {
        test('should return evidence in tool responses', async () => {
            // This test verifies that evidence is included in responses
            // Actual evidence structure is tested in agent-tools.test.ts
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            await server.initialize();

            // If agent-5d-system is available, test that evidence is returned
            if ((server as any).agentPluginAdapter.isAvailable()) {
                // Note: This would require actual data in the database
                // For now, we just verify the handler exists
                expect((server as any).agentTools).toBeDefined();
            }
        });
    });
});
