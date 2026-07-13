import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Import map entry.
 */
export interface ImportMapEntry {
    import: string;
    types?: string;
    visibility?: 'public' | 'internal';
    recommended?: boolean;
    legacy?: boolean;
}

/**
 * Public import map structure.
 */
export interface PublicImportMap {
    public_only: boolean;
    package_name_mapping: Record<string, string>;
    imports: Record<string, ImportMapEntry>;
    recommended_import_paths: string[];
    legacy_import_paths: string[];
    generated_at: string;
}

/**
 * Generates public import map from package.json exports.
 */
export class ImportMapGenerator {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Generates public import map.
     * 
     * @returns Public import map
     */
    generate(): PublicImportMap {
        const imports: Record<string, ImportMapEntry> = {};
        const packageNameMapping: Record<string, string> = {};
        const recommendedPaths: string[] = [];
        const legacyPaths: string[] = [];

        // Find all plugins
        const pluginPaths = [
            { name: '@noyrax/5d-database-plugin', path: '5d-database-plugin' },
            { name: '@noyrax/documentation-system-plugin', path: 'documentation-system-plugin' },
            { name: '@noyrax/mcp-server', path: 'mcp-server' }
        ];

        for (const plugin of pluginPaths) {
            const pluginPath = path.join(this.workspaceRoot, plugin.path);
            const packageJsonPath = path.join(pluginPath, 'package.json');
            
            if (!fs.existsSync(packageJsonPath)) {
                continue;
            }

            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const packageName = packageJson.name || plugin.name;
                
                // Store package name mapping
                packageNameMapping[packageName] = plugin.path;

                // Process exports field
                if (packageJson.exports) {
                    if (typeof packageJson.exports === 'object') {
                        for (const [exportPath, exportValue] of Object.entries(packageJson.exports)) {
                            const importKey = exportPath === '.' ? packageName : `${packageName}${exportPath}`;
                            
                            let importPath: string | undefined;
                            let typesPath: string | undefined;
                            
                            if (typeof exportValue === 'string') {
                                importPath = exportValue;
                            } else if (typeof exportValue === 'object' && exportValue !== null) {
                                const exportObj = exportValue as any;
                                importPath = exportObj.import || exportObj.default;
                                typesPath = exportObj.types;
                            }
                            
                            if (importPath) {
                                // Resolve relative paths
                                const resolvedImport = path.isAbsolute(importPath)
                                    ? importPath
                                    : path.join(pluginPath, importPath).replace(/\\/g, '/');
                                
                                const resolvedTypes = typesPath
                                    ? (path.isAbsolute(typesPath)
                                        ? typesPath
                                        : path.join(pluginPath, typesPath).replace(/\\/g, '/'))
                                    : undefined;
                                
                                imports[importKey] = {
                                    import: resolvedImport,
                                    types: resolvedTypes,
                                    visibility: 'public', // All exports are public by default
                                    recommended: exportPath === '.' || exportPath === './api', // Root and api are recommended
                                    legacy: false
                                };
                                
                                if (imports[importKey].recommended) {
                                    recommendedPaths.push(importKey);
                                }
                            }
                        }
                    }
                } else if (packageJson.main) {
                    // Fallback to main field
                    const importKey = packageName;
                    const resolvedImport = path.isAbsolute(packageJson.main)
                        ? packageJson.main
                        : path.join(pluginPath, packageJson.main).replace(/\\/g, '/');
                    
                    imports[importKey] = {
                        import: resolvedImport,
                        types: packageJson.types
                            ? (path.isAbsolute(packageJson.types)
                                ? packageJson.types
                                : path.join(pluginPath, packageJson.types).replace(/\\/g, '/'))
                            : undefined,
                        visibility: 'public',
                        recommended: true, // Main entry point is always recommended
                        legacy: false
                    };
                    recommendedPaths.push(importKey);
                }

                // Check for TypeScript declaration files to detect internal symbols
                // This is a simplified check - in a full implementation, we'd parse .d.ts files
                const outDir = path.join(pluginPath, 'out');
                if (fs.existsSync(outDir)) {
                    // Mark src/ paths as internal if they exist
                    const srcApiPath = path.join(pluginPath, 'src', 'api');
                    if (fs.existsSync(srcApiPath)) {
                        // Internal paths should not be in public import map
                        // This is handled by only including package.json exports
                    }
                }
            } catch (error) {
                // Skip if can't read
                continue;
            }
        }

        return {
            public_only: true,
            package_name_mapping: packageNameMapping,
            imports,
            recommended_import_paths: recommendedPaths,
            legacy_import_paths: legacyPaths,
            generated_at: new Date().toISOString()
        };
    }

    /**
     * Writes import map to file.
     * 
     * @param outputPath Output file path
     */
    write(outputPath: string): void {
        const importMap = this.generate();
        
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, JSON.stringify(importMap, null, 2), 'utf8');
    }
}

