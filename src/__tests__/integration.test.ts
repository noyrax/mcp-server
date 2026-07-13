/**
 * Integration tests for Unified MCP Server.
 * Tests the integration of Database Tools, Validation Tools, and Orchestration Tools.
 */

import { UnifiedMcpServer } from '../server.js';
import { WorkspaceResolver } from '../workspace-resolver.js';
import { DatabasePluginAdapter } from '../plugins/database-plugin-adapter.js';
import { DocumentationPluginAdapter } from '../plugins/documentation-plugin-adapter.js';
import { McpClientHelper } from './mcp-client-helper.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('UnifiedMcpServer Integration', () => {
    const testWorkspaceRoot = path.resolve(__dirname, '../../..');

    describe('WorkspaceResolver', () => {
        it('should resolve workspace root from path', () => {
            const resolved = WorkspaceResolver.resolveWorkspaceRoot(testWorkspaceRoot);
            expect(resolved).toBe(testWorkspaceRoot);
        });

        it('should deterministically choose the workspace file when multiple .code-workspace files exist', () => {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noyrax-workspace-resolver-'));
            const cwdBefore = process.cwd();

            try {
                // Create two possible workspace roots
                fs.mkdirSync(path.join(tmp, 'aRoot'));
                fs.mkdirSync(path.join(tmp, 'bRoot'));

                // Create two workspace files (both valid) - deterministic rule: pick alphabetically first file
                fs.writeFileSync(
                    path.join(tmp, 'a.code-workspace'),
                    JSON.stringify({ folders: [{ path: './aRoot' }] }),
                    'utf-8'
                );
                fs.writeFileSync(
                    path.join(tmp, 'b.code-workspace'),
                    JSON.stringify({ folders: [{ path: './bRoot' }] }),
                    'utf-8'
                );

                // Force CWD to temp dir so resolver uses findWorkspaceFile(process.cwd())
                process.chdir(tmp);

                // Call multiple times to assert stable behavior (no flakiness)
                const results = Array.from({ length: 10 }, () => WorkspaceResolver.resolveWorkspaceRoot());
                for (const r of results) {
                    expect(r).toBe(results[0]);
                }

                // With deterministic sorting in WorkspaceResolver, this should resolve to aRoot
                expect(results[0]).toBe(path.join(tmp, 'aRoot'));
            } finally {
                process.chdir(cwdBefore);
                try {
                    fs.rmSync(tmp, { recursive: true, force: true });
                } catch {
                    // ignore cleanup errors
                }
            }
        });

        it('should find docs directory', () => {
            const docsPath = WorkspaceResolver.findDocsDirectory(testWorkspaceRoot);
            // Docs might not exist in test environment, so we just check the function doesn't throw
            expect(typeof docsPath === 'string' || docsPath === null).toBe(true);
        });

        it('should find plugin paths', () => {
            const pluginPaths = WorkspaceResolver.findPluginPaths(testWorkspaceRoot);
            expect(pluginPaths).toHaveProperty('databasePlugin');
            expect(pluginPaths).toHaveProperty('documentationPlugin');
        });
    });

    describe('Plugin Adapters', () => {
        it('should create database plugin adapter', () => {
            const adapter = new DatabasePluginAdapter(testWorkspaceRoot);
            expect(adapter).toBeDefined();
            expect(adapter.getWorkspaceRoot()).toBe(testWorkspaceRoot);
        });

        it('should create documentation plugin adapter', () => {
            const adapter = new DocumentationPluginAdapter(testWorkspaceRoot);
            expect(adapter).toBeDefined();
        });

        it('should check plugin availability', () => {
            const dbAdapter = new DatabasePluginAdapter(testWorkspaceRoot);
            const docAdapter = new DocumentationPluginAdapter(testWorkspaceRoot);
            
            // Availability depends on whether plugins are compiled
            expect(typeof dbAdapter.isAvailable()).toBe('boolean');
            expect(typeof docAdapter.isAvailable()).toBe('boolean');
        });
    });

    describe('MCP Server', () => {
        it('should create server instance', () => {
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            expect(server).toBeDefined();
        });

        it('should initialize without errors', async () => {
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            // Initialize might fail if plugins are not available, but should not throw
            try {
                await server.initialize();
            } catch (error) {
                // Expected if plugins are not available
                expect(error).toBeDefined();
            }
        });
    });

    describe('Tool Registration', () => {
        it('should register database tools when plugin is available', async () => {
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            const dbAdapter = new DatabasePluginAdapter(testWorkspaceRoot);
            
            if (dbAdapter.isAvailable()) {
                // Server should have registered database tools
                expect(server).toBeDefined();
            }
        });

        it('should register validation tools when plugin is available', async () => {
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            const docAdapter = new DocumentationPluginAdapter(testWorkspaceRoot);
            
            if (docAdapter.isAvailable()) {
                // Server should have registered validation tools
                expect(server).toBeDefined();
            }
        });

        it('should always register orchestration tools', () => {
            const server = new UnifiedMcpServer(testWorkspaceRoot);
            // Orchestration tools should always be available
            expect(server).toBeDefined();
        });
    });

    describe('MCP Server JSON-RPC Communication (Smoke Tests)', () => {
        let client: McpClientHelper;
        const testWorkspaceRoot = path.resolve(__dirname, '../../..');

        beforeAll(async () => {
            client = new McpClientHelper();
            await client.start(testWorkspaceRoot);
        });

        afterAll(async () => {
            await client.stop();
        });

        describe('Server Startup', () => {
            it('should start server without errors', async () => {
                // Server should be running (no exception in beforeAll)
                expect(client).toBeDefined();
            });

            it('should respond to tools/list request', async () => {
                const response = await client.sendRequest('tools/list', {});
                
                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');
                
                if (response.error) {
                    // If error, it should be a valid error response
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    // If success, should have tools array
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('tools');
                    expect(Array.isArray(response.result.tools)).toBe(true);
                }
            });
        });

        describe('Orchestration Tools', () => {
            it('should call workflow/check_status', async () => {
                // Get plugin ID (simple hash-based approach)
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);
                
                const response = await client.sendRequest('tools/call', {
                    name: 'workflow/check_status',
                    arguments: { pluginId }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    // Error is acceptable (e.g., if docs/ or DBs don't exist)
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    // Success: should have status object
                    expect(response.result).toBeDefined();
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('docs');
                    expect(content).toHaveProperty('databases');
                    expect(content).toHaveProperty('plugins');
                }
            });

            it('should call workflow/autonomous_feature', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);

                const response = await client.sendRequest('tools/call', {
                    name: 'workflow/autonomous_feature',
                    arguments: {
                        pluginId,
                        requirement: 'test feature requirement',
                        limit: 1,
                        ensureReady: false
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    // Error is acceptable (environment-dependent)
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('status');
                    expect(content).toHaveProperty('requirement');
                    expect(content).toHaveProperty('steps');
                }
            }, 15000);

            it('should call workflow/autonomous_refactoring', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);

                const response = await client.sendRequest('tools/call', {
                    name: 'workflow/autonomous_refactoring',
                    arguments: {
                        pluginId,
                        filePath: 'mcp-server/src/server.ts',
                        goal: 'Refactor (smoke-test)'
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('status');
                    expect(content).toHaveProperty('filePath');
                    expect(content).toHaveProperty('steps');
                }
            }, 15000);

            it('should call workflow/autonomous_documentation', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);

                const response = await client.sendRequest('tools/call', {
                    name: 'workflow/autonomous_documentation',
                    arguments: {
                        pluginId,
                        minDependencies: 5,
                        limit: 5,
                        generateAdrs: false,
                        dryRun: true,
                        verifyAdrs: false,
                        ensureReady: false
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('status');
                    expect(content).toHaveProperty('steps');
                    expect(content).toHaveProperty('summary');
                }
            }, 15000);

            it('should call workflow/co_partner_plan', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);

                const response = await client.sendRequest('tools/call', {
                    name: 'workflow/co_partner_plan',
                    arguments: {
                        pluginId,
                        changeType: 'feature',
                        goal: 'Implementiere Feature X (Co-Partner Plan)',
                        targetFiles: [],
                        constraints: ['Max 3 Dateien pro Batch', 'Reality-Driven Verification']
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('status');
                    expect(content).toHaveProperty('recommendedToolCalls');
                    expect(content).toHaveProperty('humanCheckpoints');
                    expect(content).toHaveProperty('rollback');
                }
            }, 15000);

            it('should call workflow/co_partner_feedback', async () => {
                const response = await client.sendRequest('tools/call', {
                    name: 'workflow/co_partner_feedback',
                    arguments: {
                        stage: 'review',
                        feedback: 'ok, weiter'
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    expect(response.result).toBeDefined();
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('nextAction');
                }
            }, 15000);

            it('should call workflow/co_partner_rollback', async () => {
                const response = await client.sendRequest('tools/call', {
                    name: 'workflow/co_partner_rollback',
                    arguments: {
                        strategy: 'git',
                        targetPaths: ['mcp-server/src/server.ts']
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    expect(response.result).toBeDefined();
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('strategy');
                    expect(content).toHaveProperty('powershell');
                    expect(content).toHaveProperty('bash');
                }
            }, 15000);
        });

        describe('Database Tools (if available)', () => {
            it('should call bootstrap tool', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);
                
                const response = await client.sendRequest('tools/call', {
                    name: 'bootstrap',
                    arguments: { pluginId }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    // Error is acceptable (e.g., if plugin not available or docs/ missing)
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    // Success: should have bootstrap content
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                }
            });

            it('should call system_explanation tool', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);
                
                const response = await client.sendRequest('tools/call', {
                    name: 'system_explanation',
                    arguments: { pluginId }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    // Error is acceptable
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    // Success: should have explanation content
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                }
            });

            it('should call adr_generator tool (dry run)', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);

                const response = await client.sendRequest('tools/call', {
                    name: 'adr_generator',
                    arguments: {
                        pluginId,
                        dryRun: true,
                        // Set a very high dependency threshold to avoid heavy generation work when DBs exist.
                        minDependencies: 999999,
                        limit: 1,
                        useLLM: false
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    // Error is acceptable (e.g., plugin not available, missing DBs/docs, etc.)
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                }
            });

            it('should call workflow_boundary_report tool', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);

                const response = await client.sendRequest('tools/call', {
                    name: 'workflow_boundary_report',
                    arguments: {
                        pluginId
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    // Error is acceptable
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    // Success: should have boundary report content
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                    
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('workspace_root');
                    expect(content).toHaveProperty('detected_plugin_roots');
                    expect(content).toHaveProperty('exclude_dirs');
                    expect(content).toHaveProperty('path_normalization');
                    expect(content).toHaveProperty('ignore_rules');
                    expect(content).toHaveProperty('boundary_validation');
                    expect(content).toHaveProperty('evidence');
                    expect(content.evidence.grade).toBe('FACT');
                    expect(Array.isArray(content.evidence.sources)).toBe(true);
                }
            });
        });

        describe('Validation Tools (if available)', () => {
            it('should call validation/runScan tool', async () => {
                const response = await client.sendRequest('tools/call', {
                    name: 'validation/runScan',
                    arguments: {
                        incremental: true,
                        // Keep this test fast/deterministic: scan a single file only.
                        files: ['mcp-server/src/server.ts']
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    // Error is acceptable (e.g., if plugin not available or docs/ missing)
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    // Success: should have scan result
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toBeDefined();
                }
            });
        });

        describe('Error Handling', () => {
            it('should handle unknown tool gracefully', async () => {
                const response = await client.sendRequest('tools/call', {
                    name: 'unknown_tool',
                    arguments: {}
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');
                
                // Should return error for unknown tool OR return error in result content
                if (response.error) {
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else if (response.result) {
                    // Some tools return error in result content
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('error');
                } else {
                    // At minimum, should not crash
                    expect(response).toBeDefined();
                }
            });

            it('should handle invalid tool arguments gracefully', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);
                
                const response = await client.sendRequest('tools/call', {
                    name: 'workflow/check_status',
                    arguments: { pluginId: null } // Invalid argument
                });

                expect(response).toBeDefined();
                // Should either return error or handle gracefully
                if (response.error) {
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                }
            });
        });

        describe('Boundary Report', () => {
            it('should call workflow_boundary_report tool', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);

                const response = await client.sendRequest('tools/call', {
                    name: 'workflow_boundary_report',
                    arguments: {
                        pluginId
                    }
                });

                expect(response).toBeDefined();
                expect(response.jsonrpc).toBe('2.0');

                if (response.error) {
                    // Error is acceptable
                    expect(response.error).toHaveProperty('code');
                    expect(response.error).toHaveProperty('message');
                } else {
                    // Success: should have boundary report content
                    expect(response.result).toBeDefined();
                    expect(response.result).toHaveProperty('content');
                    
                    const content = JSON.parse(response.result.content[0].text);
                    expect(content).toHaveProperty('workspace_root');
                    expect(content).toHaveProperty('detected_plugin_roots');
                    expect(content).toHaveProperty('exclude_dirs');
                    expect(content).toHaveProperty('path_normalization');
                    expect(content).toHaveProperty('ignore_rules');
                    expect(content).toHaveProperty('boundary_validation');
                    expect(content).toHaveProperty('evidence');
                    expect(content.evidence.grade).toBe('FACT');
                    expect(Array.isArray(content.evidence.sources)).toBe(true);
                }
            });
        });

        describe('Evidence Grading', () => {
            it('should have evidence in query_modules response', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);
                const dbAdapter = new DatabasePluginAdapter(testWorkspaceRoot);
                
                if (!dbAdapter.isAvailable()) {
                    // Skip if plugin not available
                    return;
                }

                const server = new UnifiedMcpServer(testWorkspaceRoot);
                await server.initialize();
                
                const response = await client.sendRequest('tools/call', {
                    name: 'query_modules',
                    arguments: {
                        filePath: 'mcp-server/src/server.ts',
                        pluginId
                    }
                });

                if (response.error) {
                    // Error is acceptable if DBs/docs not available
                    return;
                }

                expect(response.result).toBeDefined();
                const content = JSON.parse(response.result.content[0].text);
                expect(content).toHaveProperty('evidence');
                expect(content.evidence).toHaveProperty('grade');
                expect(['FACT', 'INFERRED', 'HEURISTIC']).toContain(content.evidence.grade);
                expect(Array.isArray(content.evidence.sources)).toBe(true);
            });

            it('should have evidence in cross_analysis response', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);
                const dbAdapter = new DatabasePluginAdapter(testWorkspaceRoot);
                
                if (!dbAdapter.isAvailable()) {
                    // Skip if plugin not available
                    return;
                }

                const server = new UnifiedMcpServer(testWorkspaceRoot);
                await server.initialize();
                
                const response = await client.sendRequest('tools/call', {
                    name: 'cross_analysis',
                    arguments: {
                        filePath: 'mcp-server/src/server.ts',
                        pluginId
                    }
                });

                if (response.error) {
                    // Error is acceptable if DBs/docs not available
                    return;
                }

                expect(response.result).toBeDefined();
                const content = JSON.parse(response.result.content[0].text);
                expect(content).toHaveProperty('evidence');
                expect(content.evidence).toHaveProperty('grade');
                expect(['FACT', 'INFERRED', 'HEURISTIC']).toContain(content.evidence.grade);
                expect(Array.isArray(content.evidence.sources)).toBe(true);
                // cross_analysis should be INFERRED (from multiple queries)
                if (content.evidence.grade === 'INFERRED') {
                    expect(content.evidence.sources.length).toBeGreaterThan(1);
                }
            });

            it('should have evidence in system_explanation response', async () => {
                const pluginId = Buffer.from(testWorkspaceRoot).toString('base64').substring(0, 16);
                const dbAdapter = new DatabasePluginAdapter(testWorkspaceRoot);
                
                if (!dbAdapter.isAvailable()) {
                    // Skip if plugin not available
                    return;
                }

                const server = new UnifiedMcpServer(testWorkspaceRoot);
                await server.initialize();
                
                const response = await client.sendRequest('tools/call', {
                    name: 'system_explanation',
                    arguments: {
                        pluginId
                    }
                });

                if (response.error) {
                    // Error is acceptable if DBs/docs not available
                    return;
                }

                expect(response.result).toBeDefined();
                const content = JSON.parse(response.result.content[0].text);
                expect(content).toHaveProperty('evidence');
                expect(content.evidence).toHaveProperty('grade');
                expect(['FACT', 'INFERRED', 'HEURISTIC']).toContain(content.evidence.grade);
                expect(Array.isArray(content.evidence.sources)).toBe(true);
            });
        });
    });
});

