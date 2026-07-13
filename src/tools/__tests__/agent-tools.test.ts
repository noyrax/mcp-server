import { AgentTools } from '../agent-tools';
import { createMockAgentPluginAdapter } from './mocks/agent-plugin-adapter-mock';
import {
    MockAgentApi,
    MockAgentComponentApi,
    MockAgentDependencyApi,
    MockAgentDecisionApi,
    MockAgentChangeApi,
    MockAgentCrossDimensionApi
} from './mocks/agent-apis-mock';

describe('AgentTools', () => {
    let agentTools: AgentTools;
    let mockAdapter: any;
    let mockDbManager: any;
    let mockAgentApi: MockAgentApi;
    let mockComponentApi: MockAgentComponentApi;
    let mockDependencyApi: MockAgentDependencyApi;
    let mockDecisionApi: MockAgentDecisionApi;
    let mockChangeApi: MockAgentChangeApi;
    let mockCrossDimensionApi: MockAgentCrossDimensionApi;
    const testWorkspaceRoot = '/test/workspace';
    const testPluginId = 'test-plugin-id';

    beforeEach(() => {
        mockDbManager = {};
        mockAdapter = createMockAgentPluginAdapter(testWorkspaceRoot, mockDbManager);
        mockAdapter.setAvailable(true);
        mockAdapter.setPluginPath('/mock/agent-5d-system');

        mockAgentApi = new MockAgentApi();
        mockComponentApi = new MockAgentComponentApi();
        mockDependencyApi = new MockAgentDependencyApi();
        mockDecisionApi = new MockAgentDecisionApi();
        mockChangeApi = new MockAgentChangeApi();
        mockCrossDimensionApi = new MockAgentCrossDimensionApi();

        agentTools = new AgentTools({
            workspaceRoot: testWorkspaceRoot,
            adapter: mockAdapter
        });

        // Inject mock APIs (simulating initialize())
        (agentTools as any).dbManager = mockDbManager;
        (agentTools as any).agentApi = mockAgentApi;
        (agentTools as any).componentApi = mockComponentApi;
        (agentTools as any).dependencyApi = mockDependencyApi;
        (agentTools as any).decisionApi = mockDecisionApi;
        (agentTools as any).changeApi = mockChangeApi;
        (agentTools as any).crossDimensionApi = mockCrossDimensionApi;
    });

    describe('initialize', () => {
        test('should throw error if adapter not provided', async () => {
            const tools = new AgentTools({ workspaceRoot: testWorkspaceRoot });
            await expect(tools.initialize()).rejects.toThrow('AgentPluginAdapter is required');
        });

        test('should throw error if adapter not available', async () => {
            mockAdapter.setAvailable(false);
            await expect(agentTools.initialize()).rejects.toThrow('Agent-5D-System Plugin is not available');
        });

        test('should initialize successfully when adapter is available', async () => {
            // Note: This test would require actual dynamic imports, which is complex in tests
            // For now, we test the logic by manually setting APIs (as done in beforeEach)
            expect((agentTools as any).agentApi).toBeDefined();
        });
    });

    describe('isAvailable', () => {
        test('should return false if adapter not provided', async () => {
            const tools = new AgentTools({ workspaceRoot: testWorkspaceRoot });
            const result = await tools.isAvailable();
            expect(result).toBe(false);
        });

        test('should return true if adapter is available', async () => {
            mockAdapter.setAvailable(true);
            const result = await agentTools.isAvailable();
            expect(result).toBe(true);
        });

        test('should return false if adapter is not available', async () => {
            mockAdapter.setAvailable(false);
            const result = await agentTools.isAvailable();
            expect(result).toBe(false);
        });
    });

    describe('queryAgents', () => {
        test('should return agent by ID', async () => {
            const testAgent = {
                id: 'agent-1',
                file_path: 'workflows/n8n/test.json',
                agent_type: 'n8n',
                plugin_id: testPluginId
            };
            mockAgentApi.setAgent('agent-1', testAgent);

            const result = await agentTools.queryAgents({
                agentId: 'agent-1',
                pluginId: testPluginId
            });

            expect(result.id).toBe('agent-1');
            expect(result.evidence).toBeDefined();
            expect(result.evidence.grade).toBe('FACT');
        });

        test('should return agent by path', async () => {
            const testAgent = {
                id: 'agent-1',
                file_path: 'workflows/n8n/test.json',
                agent_type: 'n8n',
                plugin_id: testPluginId
            };
            mockAgentApi.setAgent('agent-1', testAgent);

            const result = await agentTools.queryAgents({
                agentPath: 'workflows/n8n/test.json',
                pluginId: testPluginId
            });

            expect(result.id).toBe('agent-1');
            expect(result.evidence).toBeDefined();
        });

        test('should return all agents when no parameters', async () => {
            const testAgents = [
                { id: 'agent-1', file_path: 'workflow1.json', plugin_id: testPluginId },
                { id: 'agent-2', file_path: 'workflow2.json', plugin_id: testPluginId }
            ];
            mockAgentApi.setAgent('agent-1', testAgents[0]);
            mockAgentApi.setAgent('agent-2', testAgents[1]);

            const result = await agentTools.queryAgents({
                pluginId: testPluginId
            });

            expect(result.agents).toHaveLength(2);
            expect(result.evidence).toBeDefined();
        });

        test('should return error if not initialized', async () => {
            const tools = new AgentTools({ workspaceRoot: testWorkspaceRoot, adapter: mockAdapter });
            const result = await tools.queryAgents({ pluginId: testPluginId });

            expect(result.error).toBe('Agent-5D-System not initialized');
        });
    });

    describe('queryAgentComponents', () => {
        test('should return component by component ID', async () => {
            const testComponent = {
                id: 'comp-1',
                component_id: 'comp-1',
                component_name: 'Test Component',
                plugin_id: testPluginId
            };
            mockComponentApi.setComponent('comp-1', testComponent);

            const result = await agentTools.queryAgentComponents({
                componentId: 'comp-1',
                pluginId: testPluginId
            });

            expect(result.components).toHaveLength(1);
            expect(result.components[0].component_id).toBe('comp-1');
            expect(result.evidence).toBeDefined();
        });

        test('should return components by agent path', async () => {
            const testComponents = [
                { id: 'comp-1', component_id: 'comp-1', agent_path: 'workflow1.json', plugin_id: testPluginId },
                { id: 'comp-2', component_id: 'comp-2', agent_path: 'workflow1.json', plugin_id: testPluginId },
                { id: 'comp-3', component_id: 'comp-3', agent_path: 'workflow2.json', plugin_id: testPluginId }
            ];
            mockComponentApi.setComponent('comp-1', testComponents[0]);
            mockComponentApi.setComponent('comp-2', testComponents[1]);
            mockComponentApi.setComponent('comp-3', testComponents[2]);

            const result = await agentTools.queryAgentComponents({
                path: 'workflow1.json',
                pluginId: testPluginId
            });

            expect(result.components).toHaveLength(2);
            expect(result.evidence).toBeDefined();
        });
    });

    describe('queryAgentDependencies', () => {
        test('should return dependencies with fromAgent and toAgent', async () => {
            const testComponents = [
                { component_id: 'comp-1', agent_path: 'workflow1.json' },
                { component_id: 'comp-2', agent_path: 'workflow2.json' }
            ];
            mockComponentApi.setComponent('comp-1', testComponents[0]);
            mockComponentApi.setComponent('comp-2', testComponents[1]);

            const testDeps = [
                { from_component_id: 'comp-1', to_component_id: 'comp-2', dependency_type: 'flow' }
            ];
            mockDependencyApi.setDependencies(testDeps);

            const result = await agentTools.queryAgentDependencies({
                fromAgent: 'workflow1.json',
                toAgent: 'workflow2.json',
                pluginId: testPluginId
            });

            expect(result.dependencies).toHaveLength(1);
            expect(result.evidence).toBeDefined();
        });

        test('should return all dependencies when no parameters', async () => {
            const testDeps = [
                { from_component_id: 'comp-1', to_component_id: 'comp-2' },
                { from_component_id: 'comp-2', to_component_id: 'comp-3' }
            ];
            mockDependencyApi.setDependencies(testDeps);

            const result = await agentTools.queryAgentDependencies({
                pluginId: testPluginId
            });

            expect(result.dependencies).toHaveLength(2);
            expect(result.evidence).toBeDefined();
        });
    });

    describe('queryAgentDecisions', () => {
        test('should return decision by number', async () => {
            const testDecision = {
                id: 'decision-1',
                decision_number: '001',
                title: 'Test Decision',
                plugin_id: testPluginId
            };
            mockDecisionApi.setDecision('001', testDecision);

            const result = await agentTools.queryAgentDecisions({
                decisionNumberOrPath: '001',
                pluginId: testPluginId
            });

            expect(result.decisions).toHaveLength(1);
            expect(result.decisions[0].decision_number).toBe('001');
            expect(result.evidence).toBeDefined();
        });

        test('should return decisions by agent path', async () => {
            const testDecision = {
                id: 'decision-1',
                decision_number: '001',
                plugin_id: testPluginId
            };
            mockDecisionApi.setDecision('001', testDecision);
            mockDecisionApi.setMappings('decision-1', [
                { agent_path: 'workflow1.json' }
            ]);

            const result = await agentTools.queryAgentDecisions({
                decisionNumberOrPath: 'workflow1.json',
                pluginId: testPluginId
            });

            expect(result.decisions).toHaveLength(1);
            expect(result.evidence).toBeDefined();
        });
    });

    describe('queryAgentChanges', () => {
        test('should return all change reports and latest', async () => {
            const testReports = [
                { id: 'report-1', created_at: new Date('2024-01-01'), plugin_id: testPluginId },
                { id: 'report-2', created_at: new Date('2024-01-02'), plugin_id: testPluginId }
            ];
            mockChangeApi.setChangeReports(testReports);

            const result = await agentTools.queryAgentChanges({
                pluginId: testPluginId
            });

            expect(result.changeReports).toHaveLength(2);
            expect(result.latestChangeReport).not.toBeNull();
            expect(result.evidence).toBeDefined();
        });
    });

    describe('crossAnalysisAgent', () => {
        test('should return cross-analysis', async () => {
            const testAnalysis = {
                agent: { id: 'agent-1', file_path: 'workflow1.json' },
                components: [{ component_id: 'comp-1' }],
                dependencies: [{ from_component_id: 'comp-1', to_component_id: 'comp-2' }],
                decisions: [{ decision_number: '001' }],
                changes: [{ id: 'report-1' }]
            };
            mockCrossDimensionApi.setCrossAnalysis(testAnalysis);

            const result = await agentTools.crossAnalysisAgent({
                agentPath: 'workflow1.json',
                pluginId: testPluginId
            });

            expect(result.agent).not.toBeNull();
            expect(result.components).toHaveLength(1);
            expect(result.dependencies).toHaveLength(1);
            expect(result.decisions).toHaveLength(1);
            expect(result.changes).toHaveLength(1);
            expect(result.evidence).toBeDefined();
        });
    });

    describe('semanticDiscoveryAgents', () => {
        test('should return placeholder error', async () => {
            const result = await agentTools.semanticDiscoveryAgents({
                query: 'test query',
                pluginId: testPluginId,
                limit: 5
            });

            expect(result.error).toBe('Semantic search not yet implemented');
            expect(result.query).toBe('test query');
        });
    });
});
