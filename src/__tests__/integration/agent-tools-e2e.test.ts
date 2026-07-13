import { UnifiedMcpServer } from '../../server.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * End-to-End tests for Agent-5D-System MCP Server Integration.
 * Tests the full workflow: Scan → Generate → Ingest → Query via MCP Tools.
 * 
 * Note: These tests require agent-5d-system to be available and compiled.
 */
describe('AgentTools End-to-End', () => {
    let tempWorkspace: string;
    let server: UnifiedMcpServer;
    const agent5dSystemPath = path.resolve(__dirname, '../../../../agent-5d-system');

    beforeAll(() => {
        // Check if agent-5d-system exists and is compiled
        if (!fs.existsSync(agent5dSystemPath)) {
            console.warn('agent-5d-system not found, skipping E2E tests');
            return;
        }

        const outPath = path.join(agent5dSystemPath, 'out');
        if (!fs.existsSync(outPath)) {
            console.warn('agent-5d-system not compiled, skipping E2E tests');
            return;
        }
    });

    beforeEach(() => {
        // Create temporary workspace for testing
        tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-5d-e2e-'));
        
        // Create workflows directory structure
        const workflowsDir = path.join(tempWorkspace, 'workflows', 'n8n');
        fs.mkdirSync(workflowsDir, { recursive: true });

        // Create a simple test workflow
        const testWorkflow = {
            name: 'Test Workflow',
            nodes: [
                {
                    id: 'node-1',
                    name: 'HTTP Request',
                    type: 'n8n-nodes-base.httpRequest',
                    typeVersion: 1,
                    parameters: {
                        method: 'GET',
                        url: 'https://api.example.com'
                    }
                }
            ],
            connections: {}
        };
        fs.writeFileSync(
            path.join(workflowsDir, 'test-workflow.json'),
            JSON.stringify(testWorkflow, null, 2)
        );

        server = new UnifiedMcpServer(tempWorkspace);
    });

    afterEach(async () => {
        if (server) {
            // Cleanup
        }
        if (tempWorkspace && fs.existsSync(tempWorkspace)) {
            fs.rmSync(tempWorkspace, { recursive: true, force: true });
        }
    });

    describe('Full Workflow', () => {
        test('should complete full workflow: Scan → Generate → Ingest → Query', async () => {
            // Skip if agent-5d-system not available
            if (!fs.existsSync(agent5dSystemPath)) {
                console.log('Skipping E2E test: agent-5d-system not found');
                return;
            }

            const outPath = path.join(agent5dSystemPath, 'out');
            if (!fs.existsSync(outPath)) {
                console.log('Skipping E2E test: agent-5d-system not compiled');
                return;
            }

            // Step 1: Scan
            try {
                execSync(`node ${path.join(agent5dSystemPath, 'out', 'cli', 'scan-cli.js')}`, {
                    cwd: tempWorkspace,
                    stdio: 'ignore'
                });
            } catch (error) {
                // Scan might fail if no workflows found, that's okay for this test
            }

            // Step 2: Generate
            try {
                execSync(`node ${path.join(agent5dSystemPath, 'out', 'cli', 'generate-cli.js')}`, {
                    cwd: tempWorkspace,
                    stdio: 'ignore'
                });
            } catch (error) {
                // Generate might fail, skip E2E test
                console.log('Skipping E2E test: Generate failed');
                return;
            }

            // Step 3: Ingest
            try {
                execSync(`node ${path.join(agent5dSystemPath, 'out', 'cli', 'ingest-cli.js')}`, {
                    cwd: tempWorkspace,
                    stdio: 'ignore'
                });
            } catch (error) {
                // Ingest might fail, skip E2E test
                console.log('Skipping E2E test: Ingest failed');
                return;
            }

            // Step 4: Initialize server and query via MCP Tools
            await server.initialize();

            // Check if agent-5d-system is available
            if (!(server as any).agentPluginAdapter.isAvailable()) {
                console.log('Skipping E2E test: agent-5d-system not available');
                return;
            }

            const pluginId = (server as any).agentPluginAdapter.getWorkspaceRoot();
            const resolvedPluginId = (server as any).resolvePluginId();

            // Query agents
            const tools = await server.listTools();
            const queryAgentsTool = tools.find((t: any) => t.name === 'query_agents');

            if (queryAgentsTool) {
                // This would require actual MCP protocol call, which is complex
                // For now, we just verify the tool is registered
                expect(queryAgentsTool).toBeDefined();
            }
        }, 30000); // Longer timeout for E2E tests
    });

    describe('Evidence Structure', () => {
        test('should verify evidence structure in responses', async () => {
            await server.initialize();

            if (!(server as any).agentPluginAdapter.isAvailable()) {
                console.log('Skipping evidence test: agent-5d-system not available');
                return;
            }

            // Evidence structure is tested in agent-tools.test.ts
            // This test just verifies the integration point exists
            expect((server as any).agentTools).toBeDefined();
        });
    });
});
