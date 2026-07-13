import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { OrchestrationTools } from './orchestration-tools.js';
import { ImportMapGenerator } from './import-map-generator.js';
import { WorkspaceResolver } from '../workspace-resolver.js';

/**
 * Reason codes enum (mirrored from 5d-database-plugin to avoid dependency).
 */
enum ReasonCode {
    VECTOR_BACKEND_UNREACHABLE = 'VECTOR_BACKEND_UNREACHABLE',
    WRONG_PATH = 'WRONG_PATH',
    WRONG_API_VERSION = 'WRONG_API_VERSION',
    NO_EMBEDDINGS = 'NO_EMBEDDINGS',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    TIMEOUT = 'TIMEOUT',
    MISCONFIGURED = 'MISCONFIGURED',
    DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
    NOT_INSTALLED = 'NOT_INSTALLED',
    NOT_RUNNING = 'NOT_RUNNING',
    OK = 'OK'
}

/**
 * System contract structure (matches schema).
 */
export interface SystemContract {
    system_id: string;
    contract_version: string;
    min_supported_contract_version: string;
    breaking_changes_policy: {
        policy: 'NONE' | 'MINOR' | 'MAJOR';
        description: string;
    };
    compatibility?: Record<string, {
        required_fields: string[];
        optional_fields: string[];
        deprecated_fields?: string[];
    }>;
    generated_at: string;
    workspace_root: string;
    version: string;
    plugins: Array<{
        name: string;
        version: string;
        path?: string;
    }>;
    dimensions: {
        X: { name: string; description: string };
        Y: { name: string; description: string };
        Z: { name: string; description: string };
        W: { name: string; description: string };
        T: { name: string; description: string };
        V: { name: string; description: string };
    };
    capabilities: {
        tools: Array<{
            name: string;
            version?: string;
            description: string;
            input_schema?: any;
            output_schema?: any;
            required_params?: string[];
            optional_params?: string[];
        }>;
        feature_flags: {
            v_dimension_active: boolean;
            snapshots_supported: boolean;
            evidence_active: boolean;
            delta_snapshots_supported: boolean;
        };
        limits: {
            max_result_size?: number;
            supported_dimensions: string[];
            required_backends?: string[];
        };
    };
    public_api: Record<string, {
        import?: string;
        types?: string;
    }>;
    runtime_dependencies: {
        docs_directory: {
            exists: boolean;
            path?: string;
        };
        databases: {
            modules_db: boolean;
            symbols_db: boolean;
            dependencies_db: boolean;
            adrs_db: boolean;
            changes_db: boolean;
            vectors_db: boolean;
        };
        vector_backend: {
            backend: 'chromadb' | 'vss' | 'fallback' | 'none';
            mode: 'chromadb' | 'vss' | 'fallback';
            expected_available: boolean;
            reachable: boolean;
            fallback: boolean;
            reason_code: string;
        };
        embeddings: {
            available: boolean;
            count?: number;
        };
    };
    policies: {
        soft_delete: boolean;
        active_only_default: boolean;
    };
    canonical_identifiers: {
        plugin_id: {
            algorithm: string;
            format: string;
            computed?: string;
        };
        workspace_id: {
            algorithm: string;
            format: string;
            computed?: string;
        };
        entity_id_mapping?: Record<string, any>;
        normalization_rules: {
            path_separator: string;
            case_sensitive: boolean;
            hash_algorithm: string;
        };
    };
    fallback_policy?: {
        activation_conditions: Array<{
            reason_code: string;
            description: string;
        }>;
        quality_degradation: {
            description: string;
            impact: string;
        };
        marking: {
            enabled: boolean;
            format: string;
        };
    };
    import_map?: {
        public_only: boolean;
        package_name_mapping: Record<string, string>;
        recommended_import_paths: string[];
        legacy_import_paths: string[];
    };
    sources: Array<{
        type: string;
        path: string;
        hash?: string;
    }>;
}

/**
 * Generates system contract from SYSTEM_METADATA.json and runtime status.
 */
export class SystemContractGenerator {
    private workspaceRoot: string;
    private orchestrationTools: OrchestrationTools;

    constructor(workspaceRoot: string, orchestrationTools: OrchestrationTools) {
        this.workspaceRoot = workspaceRoot;
        this.orchestrationTools = orchestrationTools;
    }

    /**
     * Generates system contract.
     * 
     * @param pluginId Plugin ID (optional, will be resolved)
     * @returns System contract
     */
    async generate(pluginId?: string): Promise<SystemContract> {
        // 1. Read SYSTEM_METADATA.json
        const metadataPath = path.join(this.workspaceRoot, 'docs', 'system', 'SYSTEM_METADATA.json');
        if (!fs.existsSync(metadataPath)) {
            throw new Error(`SYSTEM_METADATA.json not found at ${metadataPath}. Run documentation generation first.`);
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        // 2. Get runtime status
        const status = await this.orchestrationTools.checkStatus(pluginId);

        // 3. Get vector backend status (if available)
        let vectorBackendStatus: any = {
            backend: 'none',
            mode: 'fallback',
            expected_available: false,
            reachable: false,
            fallback: true,
            reason_code: ReasonCode.NOT_INSTALLED
        };

        try {
            // Try to get vector backend status via database tools
            // This requires the database plugin to be initialized
            // For now, we'll use a simplified check based on status
            if (status.embeddings?.exists) {
                vectorBackendStatus = {
                    backend: 'fallback', // Will be determined by actual backend
                    mode: process.platform === 'win32' ? 'chromadb' : 'vss',
                    expected_available: false, // Will be determined by actual check
                    reachable: false,
                    fallback: true,
                    reason_code: ReasonCode.NOT_RUNNING
                };
            }
        } catch {
            // Use default values
        }

        // 4. Contract versioning
        const contractVersion = '1.0.0';
        const minSupportedVersion = '1.0.0';
        const breakingChangesPolicy = {
            policy: 'NONE' as const,
            description: 'No breaking changes in contract version 1.0.0'
        };

        // 5. Capabilities matrix
        const capabilities = this.buildCapabilitiesMatrix(status);

        // 6. Canonical identifiers
        const canonicalIdentifiers = this.buildCanonicalIdentifiers();

        // 7. Fallback policy
        const fallbackPolicy = this.buildFallbackPolicy();

        // 8. Import map (optional)
        let importMap: any = undefined;
        try {
            const importMapGenerator = new ImportMapGenerator(this.workspaceRoot);
            const importMapData = importMapGenerator.generate();
            importMap = {
                public_only: importMapData.public_only,
                package_name_mapping: importMapData.package_name_mapping,
                recommended_import_paths: importMapData.recommended_import_paths,
                legacy_import_paths: importMapData.legacy_import_paths
            };
        } catch {
            // Import map is optional
        }

        // 9. Build contract
        const contract: SystemContract = {
            system_id: metadata.system_id,
            contract_version: contractVersion,
            min_supported_contract_version: minSupportedVersion,
            breaking_changes_policy: breakingChangesPolicy,
            compatibility: {
                '1.0.0': {
                    required_fields: [
                        'system_id',
                        'contract_version',
                        'generated_at',
                        'dimensions',
                        'capabilities',
                        'runtime_dependencies'
                    ],
                    optional_fields: [
                        'compatibility',
                        'import_map',
                        'fallback_policy',
                        'canonical_identifiers'
                    ]
                }
            },
            generated_at: new Date().toISOString(),
            workspace_root: metadata.workspace_root,
            version: metadata.version,
            plugins: metadata.plugins,
            dimensions: metadata.dimensions,
            capabilities,
            public_api: metadata.public_api,
            runtime_dependencies: {
                docs_directory: {
                    exists: status.docs?.exists === true,
                    path: status.docs?.path
                },
                databases: {
                    modules_db: status.databases?.hasModules === true,
                    symbols_db: status.databases?.hasSymbols === true,
                    dependencies_db: status.databases?.hasDependencies === true,
                    adrs_db: status.databases?.hasAdrs === true,
                    changes_db: status.databases?.hasChanges === true,
                    vectors_db: status.embeddings?.exists === true
                },
                vector_backend: vectorBackendStatus,
                embeddings: {
                    available: status.embeddings?.exists === true
                }
            },
            policies: metadata.policies,
            canonical_identifiers: canonicalIdentifiers,
            fallback_policy: fallbackPolicy,
            import_map: importMap,
            sources: [
                {
                    type: 'SYSTEM_METADATA',
                    path: 'docs/system/SYSTEM_METADATA.json',
                    hash: this.computeFileHash(metadataPath)
                },
                {
                    type: 'STATUS_CHECK',
                    path: 'workflow/check_status',
                    hash: this.computeStatusHash(status)
                }
            ]
        };

        return contract;
    }

    /**
     * Builds capabilities matrix.
     */
    private buildCapabilitiesMatrix(status: any): SystemContract['capabilities'] {
        // Tool list (simplified - in full implementation, this would be generated from MCP server tools)
        const tools: SystemContract['capabilities']['tools'] = [
            {
                name: 'query_modules',
                description: 'Query modules by file path',
                required_params: ['filePath', 'pluginId']
            },
            {
                name: 'query_symbols',
                description: 'Query symbols by path or symbol ID',
                required_params: ['pluginId']
            },
            {
                name: 'query_dependencies',
                description: 'Query dependencies by module',
                required_params: ['pluginId']
            },
            {
                name: 'query_adrs',
                description: 'Query ADRs by number or path',
                required_params: ['adrNumberOrPath', 'pluginId']
            },
            {
                name: 'query_changes',
                description: 'Query change reports',
                required_params: ['pluginId']
            },
            {
                name: 'cross_analysis',
                description: 'Perform cross-dimension analysis',
                required_params: ['filePath', 'pluginId']
            },
            {
                name: 'semantic_discovery',
                description: 'Semantic search and context retrieval',
                required_params: ['query', 'pluginId']
            },
            {
                name: 'system_explanation',
                description: 'Get system overview, entry points, and architecture ADRs',
                required_params: ['pluginId']
            },
            {
                name: 'bootstrap',
                description: 'Get bootstrap information for first-time system understanding',
                required_params: ['pluginId']
            },
            {
                name: 'vector_backend_status',
                description: 'Get vector backend status with reason codes and action hints',
                required_params: []
            },
            {
                name: 'vector_backend_healthcheck',
                description: 'Perform healthcheck on vector backend',
                required_params: []
            }
        ];

        // Feature flags
        const featureFlags = {
            v_dimension_active: status.embeddings?.exists === true,
            snapshots_supported: false, // Will be true once snapshot exporter is implemented
            evidence_active: true, // Evidence grading is implemented
            delta_snapshots_supported: false // Will be true once delta support is implemented
        };

        // Limits
        const limits = {
            max_result_size: 1000, // Default limit
            supported_dimensions: ['X', 'Y', 'Z', 'W', 'T', 'V'],
            required_backends: featureFlags.v_dimension_active
                ? (process.platform === 'win32' ? ['chromadb'] : ['vss'])
                : []
        };

        return {
            tools,
            feature_flags: featureFlags,
            limits
        };
    }

    /**
     * Builds canonical identifiers configuration.
     */
    private buildCanonicalIdentifiers(): SystemContract['canonical_identifiers'] {
        return {
            plugin_id: {
                algorithm: 'SHA256',
                format: 'hex-16'
            },
            workspace_id: {
                algorithm: 'SHA256',
                format: 'hex-16'
            },
            normalization_rules: {
                path_separator: '/',
                case_sensitive: false,
                hash_algorithm: 'SHA256'
            }
        };
    }

    /**
     * Builds fallback policy.
     */
    private buildFallbackPolicy(): SystemContract['fallback_policy'] {
        return {
            activation_conditions: [
                {
                    reason_code: ReasonCode.VECTOR_BACKEND_UNREACHABLE,
                    description: 'Vector backend is not reachable - semantic search falls back to cosine similarity'
                },
                {
                    reason_code: ReasonCode.DEPENDENCY_MISSING,
                    description: 'Required dependency is missing - functionality may be degraded'
                },
                {
                    reason_code: ReasonCode.NOT_RUNNING,
                    description: 'Required service is not running - fallback mode activated'
                }
            ],
            quality_degradation: {
                description: 'Fallback mode may result in reduced search quality or missing features',
                impact: 'Semantic search uses cosine similarity instead of vector database, which may be slower and less accurate'
            },
            marking: {
                enabled: true,
                format: 'JSON response includes mode: "fallback" and reason_code fields'
            }
        };
    }

    /**
     * Computes file hash.
     */
    private computeFileHash(filePath: string): string {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
        } catch {
            return '';
        }
    }

    /**
     * Computes status hash for deterministic source tracking.
     */
    private computeStatusHash(status: any): string {
        // Create a deterministic hash from status (excluding timestamps)
        const statusForHash = {
            docs: status.docs?.exists,
            databases: status.databases?.exists,
            embeddings: status.embeddings?.exists
        };
        return crypto.createHash('sha256')
            .update(JSON.stringify(statusForHash))
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Writes contract to file.
     * 
     * @param outputPath Output file path
     * @param pluginId Plugin ID (optional)
     */
    async write(outputPath: string, pluginId?: string): Promise<void> {
        const contract = await this.generate(pluginId);
        
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, JSON.stringify(contract, null, 2), 'utf8');
    }
}

