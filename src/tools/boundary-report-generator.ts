import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { WorkspaceResolver } from '../workspace-resolver.js';

/**
 * Boundary report structure.
 */
export interface BoundaryReport {
    workspace_root: string;  // Normalized, canonical form
    detected_plugin_roots: string[];  // Multiple plugins in Monorepo
    exclude_dirs: string[];  // node_modules, dist, etc.
    path_normalization: {
        separator: string;
        case_sensitive: boolean;
        canonical_form: string;
    };
    ignore_rules: {
        gitignore: string[];
        cursorignore: string[];
    };
    boundary_validation: {
        plugin_id_match: boolean;
        computed_plugin_id: string;
        provided_plugin_id?: string;
        issues: string[];
    };
    evidence: {
        grade: 'FACT';
        sources: Array<{
            type: 'FILESYSTEM_READ';
            path?: string;
            hash?: string;
            metadata?: Record<string, any>;
        }>;
        description: string;
    };
}

/**
 * Generates boundary report for workspace detection and validation.
 * Helps identify workspace root, plugin roots, exclude directories, and path normalization rules.
 */
export class BoundaryReportGenerator {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Generates boundary report.
     * 
     * @param pluginId Plugin ID (optional, for validation)
     * @param workspaceRootOverride Override workspace root (optional)
     * @returns Boundary report
     */
    async generate(args: { pluginId?: string; workspaceRoot?: string }): Promise<BoundaryReport> {
        const effectiveWorkspaceRoot = args.workspaceRoot 
            ? path.resolve(args.workspaceRoot)
            : path.resolve(this.workspaceRoot);

        // Normalize workspace root (canonical form)
        const normalizedWorkspaceRoot = path.resolve(effectiveWorkspaceRoot);
        const canonicalForm = WorkspaceResolver.normalizeFilePath(normalizedWorkspaceRoot);

        // Detect plugin roots
        const pluginPaths = WorkspaceResolver.findPluginPaths(normalizedWorkspaceRoot);
        const detectedPluginRoots: string[] = [];
        if (pluginPaths.databasePlugin) {
            detectedPluginRoots.push(WorkspaceResolver.normalizeFilePath(pluginPaths.databasePlugin));
        }
        if (pluginPaths.documentationPlugin) {
            detectedPluginRoots.push(WorkspaceResolver.normalizeFilePath(pluginPaths.documentationPlugin));
        }

        // Detect exclude directories
        const excludeDirs = this.detectExcludeDirs(normalizedWorkspaceRoot);

        // Path normalization rules
        const pathNormalization = {
            separator: '/',
            case_sensitive: process.platform !== 'win32',
            canonical_form: canonicalForm
        };

        // Read ignore rules
        const ignoreRules = this.readIgnoreRules(normalizedWorkspaceRoot);

        // Boundary validation
        const computedPluginId = WorkspaceResolver.computePluginId(normalizedWorkspaceRoot);
        const providedPluginId = args.pluginId?.trim();
        const pluginIdMatch = providedPluginId 
            ? (providedPluginId === computedPluginId || 
               providedPluginId === '.' || 
               providedPluginId === 'default' ||
               providedPluginId === '')
            : true; // If no pluginId provided, consider it valid

        const issues: string[] = [];
        if (providedPluginId && !pluginIdMatch) {
            issues.push(`Plugin ID mismatch: provided "${providedPluginId}" does not match computed "${computedPluginId}"`);
        }

        // Check for common boundary issues
        const docsPath = WorkspaceResolver.findDocsDirectory(normalizedWorkspaceRoot);
        if (!docsPath) {
            issues.push('docs/ directory not found in workspace root or parent directories');
        } else {
            const docsResolved = path.resolve(docsPath);
            const workspaceResolved = path.resolve(normalizedWorkspaceRoot);
            if (docsResolved !== path.join(workspaceResolved, 'docs')) {
                issues.push(`docs/ found in parent directory (${docsPath}), not in workspace root`);
            }
        }

        // Create evidence sources (FACT - directly from filesystem)
        const evidenceSources: Array<{
            type: 'FILESYSTEM_READ';
            path?: string;
            hash?: string;
            metadata?: Record<string, any>;
        }> = [];

        // Add workspace root as evidence source
        if (fs.existsSync(normalizedWorkspaceRoot)) {
            const stats = fs.statSync(normalizedWorkspaceRoot);
            evidenceSources.push({
                type: 'FILESYSTEM_READ',
                path: normalizedWorkspaceRoot,
                metadata: {
                    isDirectory: stats.isDirectory(),
                    exists: true
                }
            });
        }

        // Add plugin paths as evidence sources
        for (const pluginRoot of detectedPluginRoots) {
            if (fs.existsSync(pluginRoot)) {
                evidenceSources.push({
                    type: 'FILESYSTEM_READ',
                    path: pluginRoot,
                    metadata: {
                        isDirectory: true,
                        exists: true
                    }
                });
            }
        }

        // Add ignore files as evidence sources
        const gitignorePath = path.join(normalizedWorkspaceRoot, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
            const gitignoreHash = crypto.createHash('sha256').update(gitignoreContent).digest('hex').substring(0, 16);
            evidenceSources.push({
                type: 'FILESYSTEM_READ',
                path: gitignorePath,
                hash: gitignoreHash,
                metadata: {
                    isFile: true,
                    exists: true
                }
            });
        }

        const cursorignorePath = path.join(normalizedWorkspaceRoot, '.cursorignore');
        if (fs.existsSync(cursorignorePath)) {
            const cursorignoreContent = fs.readFileSync(cursorignorePath, 'utf-8');
            const cursorignoreHash = crypto.createHash('sha256').update(cursorignoreContent).digest('hex').substring(0, 16);
            evidenceSources.push({
                type: 'FILESYSTEM_READ',
                path: cursorignorePath,
                hash: cursorignoreHash,
                metadata: {
                    isFile: true,
                    exists: true
                }
            });
        }

        const report: BoundaryReport = {
            workspace_root: canonicalForm,
            detected_plugin_roots: detectedPluginRoots,
            exclude_dirs: excludeDirs,
            path_normalization: pathNormalization,
            ignore_rules: ignoreRules,
            boundary_validation: {
                plugin_id_match: pluginIdMatch,
                computed_plugin_id: computedPluginId,
                provided_plugin_id: providedPluginId,
                issues: issues
            },
            evidence: {
                grade: 'FACT',
                sources: evidenceSources,
                description: 'Boundary report derived from filesystem reads and workspace resolver'
            }
        };

        return report;
    }

    /**
     * Detects exclude directories (standard + from ignore files).
     */
    private detectExcludeDirs(workspaceRoot: string): string[] {
        const standardExcludes = [
            'node_modules',
            'dist',
            'out',
            '.git',
            '.vscode',
            '.cursor',
            '.database-plugin',
            'coverage',
            '.nyc_output',
            'tmp',
            'temp'
        ];

        const excludeSet = new Set<string>(standardExcludes);

        // Read .gitignore
        const gitignorePath = path.join(workspaceRoot, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            try {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
                const gitignoreLines = gitignoreContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                
                for (const line of gitignoreLines) {
                    // Simple pattern: if it's a directory name (no wildcards, no slashes), add it
                    if (!line.includes('*') && !line.includes('/') && !line.includes('\\')) {
                        excludeSet.add(line);
                    }
                }
            } catch {
                // Ignore errors reading .gitignore
            }
        }

        // Read .cursorignore
        const cursorignorePath = path.join(workspaceRoot, '.cursorignore');
        if (fs.existsSync(cursorignorePath)) {
            try {
                const cursorignoreContent = fs.readFileSync(cursorignorePath, 'utf-8');
                const cursorignoreLines = cursorignoreContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                
                for (const line of cursorignoreLines) {
                    if (!line.includes('*') && !line.includes('/') && !line.includes('\\')) {
                        excludeSet.add(line);
                    }
                }
            } catch {
                // Ignore errors reading .cursorignore
            }
        }

        return Array.from(excludeSet).sort();
    }

    /**
     * Reads ignore rules from .gitignore and .cursorignore.
     */
    private readIgnoreRules(workspaceRoot: string): {
        gitignore: string[];
        cursorignore: string[];
    } {
        const gitignore: string[] = [];
        const cursorignore: string[] = [];

        // Read .gitignore
        const gitignorePath = path.join(workspaceRoot, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            try {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
                gitignore.push(...gitignoreContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#')));
            } catch {
                // Ignore errors
            }
        }

        // Read .cursorignore
        const cursorignorePath = path.join(workspaceRoot, '.cursorignore');
        if (fs.existsSync(cursorignorePath)) {
            try {
                const cursorignoreContent = fs.readFileSync(cursorignorePath, 'utf-8');
                cursorignore.push(...cursorignoreContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#')));
            } catch {
                // Ignore errors
            }
        }

        return { gitignore, cursorignore };
    }
}

