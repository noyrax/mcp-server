import { OrchestrationTools } from '../tools/orchestration-tools.js';
import { DatabaseTools } from '../tools/database-tools.js';
import { ValidationTools } from '../tools/validation-tools.js';
import * as path from 'path';

describe('OrchestrationTools', () => {
    const testWorkspaceRoot = path.resolve(__dirname, '../../..');
    let mockDatabaseTools: jest.Mocked<DatabaseTools>;
    let mockValidationTools: jest.Mocked<ValidationTools>;
    let tools: OrchestrationTools;

    beforeEach(() => {
        mockDatabaseTools = {} as any;
        mockValidationTools = {} as any;
        tools = new OrchestrationTools(mockDatabaseTools, mockValidationTools, testWorkspaceRoot);
    });

    describe('resolvePluginId', () => {
        test('should normalize "default" to canonical plugin_id', () => {
            const canonicalId = (tools as any).resolvePluginId();
            const defaultId = (tools as any).resolvePluginId('default');

            expect(defaultId).toBe(canonicalId);
            expect(/^[0-9a-f]{16}$/i.test(defaultId)).toBe(true);
        });

        test('should compute canonical plugin_id from workspace root', () => {
            const pluginId = (tools as any).resolvePluginId();
            
            // Verify format: 16 hex characters
            expect(/^[0-9a-f]{16}$/i.test(pluginId)).toBe(true);
            
            // Verify deterministic: same workspace root = same plugin_id
            const pluginId2 = (tools as any).resolvePluginId();
            expect(pluginId2).toBe(pluginId);
        });

        test('should treat "default" as alias and compute canonical ID', () => {
            const canonicalId = (tools as any).resolvePluginId();
            const defaultId1 = (tools as any).resolvePluginId('default');
            const defaultId2 = (tools as any).resolvePluginId('default');

            // All should be the same canonical ID
            expect(defaultId1).toBe(canonicalId);
            expect(defaultId2).toBe(canonicalId);
            expect(defaultId1).toBe(defaultId2);
        });

        test('should accept valid 16-hex plugin_id and return lowercase', () => {
            const validPluginId = 'a1b2c3d4e5f67890';
            const resolved = (tools as any).resolvePluginId(validPluginId);

            expect(resolved).toBe(validPluginId.toLowerCase());
        });

        test('should compute canonical ID for other alias values', () => {
            const canonicalId = (tools as any).resolvePluginId();
            const emptyId = (tools as any).resolvePluginId('');
            const dotId = (tools as any).resolvePluginId('.');
            const pluginNameId = (tools as any).resolvePluginId('5d-database-plugin');

            expect(emptyId).toBe(canonicalId);
            expect(dotId).toBe(canonicalId);
            expect(pluginNameId).toBe(canonicalId);
        });
    });
});

