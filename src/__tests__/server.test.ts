import { UnifiedMcpServer } from '../server.js';
import * as path from 'path';
import * as crypto from 'crypto';

describe('UnifiedMcpServer', () => {
    const testWorkspaceRoot = path.resolve(__dirname, '../../..');

    describe('resolvePluginId', () => {
        let server: UnifiedMcpServer;

        beforeEach(() => {
            server = new UnifiedMcpServer(testWorkspaceRoot);
        });

        test('should normalize "default" to canonical plugin_id', () => {
            const canonicalId = (server as any).resolvePluginId();
            const defaultId = (server as any).resolvePluginId('default');

            expect(defaultId).toBe(canonicalId);
            expect(/^[0-9a-f]{16}$/i.test(defaultId)).toBe(true);
        });

        test('should compute canonical plugin_id from workspace root', () => {
            const pluginId = (server as any).resolvePluginId();
            
            // Verify format: 16 hex characters
            expect(/^[0-9a-f]{16}$/i.test(pluginId)).toBe(true);
            
            // Verify deterministic: same workspace root = same plugin_id
            const pluginId2 = (server as any).resolvePluginId();
            expect(pluginId2).toBe(pluginId);
        });

        test('should treat "default" as alias and compute canonical ID', () => {
            const canonicalId = (server as any).resolvePluginId();
            const defaultId1 = (server as any).resolvePluginId('default');
            const defaultId2 = (server as any).resolvePluginId('default');

            // All should be the same canonical ID
            expect(defaultId1).toBe(canonicalId);
            expect(defaultId2).toBe(canonicalId);
            expect(defaultId1).toBe(defaultId2);
        });

        test('should accept valid 16-hex plugin_id and return lowercase', () => {
            const validPluginId = 'a1b2c3d4e5f67890';
            const resolved = (server as any).resolvePluginId(validPluginId);

            expect(resolved).toBe(validPluginId.toLowerCase());
        });

        test('should compute canonical ID for other alias values', () => {
            const canonicalId = (server as any).resolvePluginId();
            const dotId = (server as any).resolvePluginId('.');
            const pluginNameId = (server as any).resolvePluginId('5d-database-plugin');

            expect(dotId).toBe(canonicalId);
            expect(pluginNameId).toBe(canonicalId);
        });
    });
});

