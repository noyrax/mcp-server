import { WorkspaceResolver } from '../workspace-resolver';
import * as path from 'path';
import * as crypto from 'crypto';

describe('WorkspaceResolver', () => {
    describe('normalizeForPluginId', () => {
        it('should normalize paths to lowercase on Windows', () => {
            if (process.platform === 'win32') {
                const input = 'C:\\MyRepo';
                const result = WorkspaceResolver.normalizeForPluginId(input);
                expect(result).toBe('C:/myrepo'); // Lowercase
            }
        });

        it('should preserve case on Unix', () => {
            if (process.platform !== 'win32') {
                const input = '/home/user/MyRepo';
                const result = WorkspaceResolver.normalizeForPluginId(input);
                expect(result).toBe('/home/user/MyRepo'); // Case preserved
            }
        });

        it('should convert backslashes to forward slashes', () => {
            const input = process.platform === 'win32' ? 'C:\\MyRepo' : '/home/user';
            const result = WorkspaceResolver.normalizeForPluginId(input);
            expect(result).not.toContain('\\');
        });
    });

    describe('normalizeFilePath', () => {
        it('should normalize paths (case-preserving)', () => {
            const input = process.platform === 'win32' ? 'C:\\MyRepo\\File.ts' : '/home/user/MyRepo/File.ts';
            const result = WorkspaceResolver.normalizeFilePath(input);
            expect(result).not.toContain('\\');
            
            // Case should be preserved
            if (process.platform === 'win32') {
                expect(result).toBe('C:/MyRepo/File.ts'); // Case preserved
            } else {
                expect(result).toContain('MyRepo');
            }
        });

        it('should preserve case on all platforms', () => {
            const input = process.platform === 'win32' ? 'C:\\MyRepo\\Components\\Button.ts' : '/home/user/MyRepo/Components/Button.ts';
            const result = WorkspaceResolver.normalizeFilePath(input);
            expect(result).toContain('Components'); // Case preserved
            expect(result).toContain('Button'); // Case preserved
        });

        it('should convert backslashes to forward slashes', () => {
            if (process.platform === 'win32') {
                const input = 'C:\\MyRepo\\File.ts';
                const result = WorkspaceResolver.normalizeFilePath(input);
                expect(result).toBe('C:/MyRepo/File.ts');
            }
        });
    });

    describe('computePluginId', () => {
        it('should use normalizeForPluginId (lowercase on Windows)', () => {
            const workspaceRoot = process.platform === 'win32' ? 'C:\\MyRepo' : '/home/user/MyRepo';
            const pluginId1 = WorkspaceResolver.computePluginId(workspaceRoot);
            
            // Same path with different case should produce same plugin ID on Windows
            const workspaceRoot2 = process.platform === 'win32' ? 'C:\\MYREPO' : '/home/user/MyRepo';
            const pluginId2 = WorkspaceResolver.computePluginId(workspaceRoot2);
            
            if (process.platform === 'win32') {
                expect(pluginId1).toBe(pluginId2); // Same ID (lowercase normalization)
            } else {
                // On Unix, different case = different path = different ID
                expect(pluginId1).not.toBe(pluginId2);
            }
        });

        it('should produce deterministic plugin IDs', () => {
            const workspaceRoot = process.platform === 'win32' ? 'C:\\MyRepo' : '/home/user/MyRepo';
            const pluginId1 = WorkspaceResolver.computePluginId(workspaceRoot);
            const pluginId2 = WorkspaceResolver.computePluginId(workspaceRoot);
            expect(pluginId1).toBe(pluginId2); // Deterministic
        });

        it('should produce 16-character hex IDs', () => {
            const workspaceRoot = process.platform === 'win32' ? 'C:\\MyRepo' : '/home/user/MyRepo';
            const pluginId = WorkspaceResolver.computePluginId(workspaceRoot);
            expect(pluginId).toMatch(/^[0-9a-f]{16}$/);
        });
    });

    describe('computeEntityId', () => {
        it('should use normalizeFilePath (case-preserving)', () => {
            const entityPath1 = process.platform === 'win32' ? 'C:\\MyRepo\\File.ts' : '/home/user/MyRepo/File.ts';
            const entityId1 = WorkspaceResolver.computeEntityId('module', entityPath1);
            
            // Same path with different case should produce different entity ID (case-preserving)
            const entityPath2 = process.platform === 'win32' ? 'C:\\MyRepo\\file.ts' : '/home/user/MyRepo/file.ts';
            const entityId2 = WorkspaceResolver.computeEntityId('module', entityPath2);
            
            // Entity IDs should be different (case-preserving normalization)
            expect(entityId1).not.toBe(entityId2);
        });

        it('should include entity type in hash', () => {
            const entityPath = process.platform === 'win32' ? 'C:\\MyRepo\\File.ts' : '/home/user/MyRepo/File.ts';
            const moduleId = WorkspaceResolver.computeEntityId('module', entityPath);
            const symbolId = WorkspaceResolver.computeEntityId('symbol', entityPath);
            expect(moduleId).not.toBe(symbolId); // Different entity types = different IDs
        });

        it('should produce deterministic entity IDs', () => {
            const entityPath = process.platform === 'win32' ? 'C:\\MyRepo\\File.ts' : '/home/user/MyRepo/File.ts';
            const entityId1 = WorkspaceResolver.computeEntityId('module', entityPath);
            const entityId2 = WorkspaceResolver.computeEntityId('module', entityPath);
            expect(entityId1).toBe(entityId2); // Deterministic
        });

        it('should produce 16-character hex IDs', () => {
            const entityPath = process.platform === 'win32' ? 'C:\\MyRepo\\File.ts' : '/home/user/MyRepo/File.ts';
            const entityId = WorkspaceResolver.computeEntityId('module', entityPath);
            expect(entityId).toMatch(/^[0-9a-f]{16}$/);
        });
    });

    describe('Plugin ID vs File Path normalization', () => {
        it('should use lowercase for Plugin ID (deterministic)', () => {
            if (process.platform === 'win32') {
                const path1 = 'C:\\MyRepo';
                const path2 = 'C:\\MYREPO';
                const pluginId1 = WorkspaceResolver.computePluginId(path1);
                const pluginId2 = WorkspaceResolver.computePluginId(path2);
                expect(pluginId1).toBe(pluginId2); // Same ID (lowercase)
            }
        });

        it('should use case-preserving for File Paths (Git compatibility)', () => {
            const path1 = process.platform === 'win32' ? 'C:\\MyRepo\\Components\\Button.ts' : '/home/user/MyRepo/Components/Button.ts';
            const path2 = process.platform === 'win32' ? 'C:\\MyRepo\\components\\button.ts' : '/home/user/MyRepo/components/button.ts';
            const entityId1 = WorkspaceResolver.computeEntityId('module', path1);
            const entityId2 = WorkspaceResolver.computeEntityId('module', path2);
            expect(entityId1).not.toBe(entityId2); // Different IDs (case-preserving)
        });
    });
});
