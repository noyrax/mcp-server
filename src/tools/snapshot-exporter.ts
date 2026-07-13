import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { pathToFileURL } from 'url';
import { SystemContractGenerator, SystemContract } from './system-contract-generator.js';
import { OrchestrationTools } from './orchestration-tools.js';
import { WorkspaceResolver } from '../workspace-resolver.js';

/**
 * Dimension slice data.
 */
export interface DimensionSlice {
    dimension: 'X' | 'Y' | 'Z' | 'W' | 'T' | 'V';
    data: any[];
    checksum: string;
    count: number;
}

/**
 * Code slice in snapshot.
 */
export interface CodeSlice {
    file_path: string;
    symbol_id: string;
    start_line: number;
    end_line: number;
    snippet: string;
    content_hash: string;
    byte_size: number;
    reason: 'ENTRY_POINT' | 'MCP_TOOL' | 'HIGH_DEPENDENCY' | 'CRITICAL_PATH';
}

/**
 * Snapshot structure (refs-first per ADR-055).
 */
export interface Snapshot {
    // Artifact metadata (always present)
    artifact_id?: string;  // Hash-based ID (for refs mode)
    artifact_type?: 'snapshot';  // For refs mode
    snapshot_version: string;
    snapshot_type: 'full' | 'delta';
    generated_at: string;
    checksum?: string;  // Overall snapshot checksum (for refs mode)
    evidence?: any;  // Evidence block (for refs mode)
    
    // Preview (for refs mode) - per ADR-055: only dimensions_included and checksums
    preview?: {
        contract_version: string;
        dimensions_included: string[];
        checksums: Record<string, string>;
    };
    
    // Full data (only in mode="full" or when expand includes dimensions)
    contract?: SystemContract;
    dimension_slices?: DimensionSlice[];
    checksums?: {
        contract: string;
        dimensions: Record<string, string>;
    };
    rebuild_instructions?: {
        steps: string[];
        prerequisites: string[];
    };
    last_snapshot_hash?: string; // For delta snapshots
    code_slices?: {
        inclusion_policy: 'NONE' | 'ENTRY_POINTS' | 'MCP_TOOLS' | 'TOP_N' | 'CUSTOM';
        max_total_bytes: number;
        slices: CodeSlice[];
    };
    
    // File path (only when exported to file)
    file_path?: string;
}

/**
 * Exports system snapshot (contract + dimension slices + checksums).
 */
export class SnapshotExporter {
    private workspaceRoot: string;
    private orchestrationTools: OrchestrationTools;
    private contractGenerator: SystemContractGenerator;

    constructor(workspaceRoot: string, orchestrationTools: OrchestrationTools) {
        this.workspaceRoot = workspaceRoot;
        this.orchestrationTools = orchestrationTools;
        this.contractGenerator = new SystemContractGenerator(workspaceRoot, orchestrationTools);
    }

    /**
     * Exports snapshot (refs-first per ADR-055).
     * 
     * @param pluginId Plugin ID (optional)
     * @param mode 'refs' (default) or 'full' - refs mode only returns references, full mode returns all data
     * @param expand Array of dimensions to expand (e.g., ['X', 'Y']) - only relevant in refs mode
     * @param includeCodeSlices If true, include selective code slices (default: false, only in full mode)
     * @param codeSlicePolicy Policy for selecting code slices (default: 'MCP_TOOLS')
     * @param maxCodeBytes Maximum bytes for code slices (default: 100KB)
     * @returns Snapshot (refs or full based on mode)
     */
    async exportFull(
        pluginId?: string,
        mode: 'refs' | 'full' = 'refs',
        expand: string[] = [],
        includeCodeSlices: boolean = false,
        codeSlicePolicy: 'ENTRY_POINTS' | 'MCP_TOOLS' | 'TOP_N' = 'MCP_TOOLS',
        maxCodeBytes: number = 102400
    ): Promise<Snapshot> {
        const contract = await this.contractGenerator.generate(pluginId);
        
        // In refs mode, only get counts and checksums, not full data
        if (mode === 'refs') {
            const dimensionMetadata = await this.exportDimensionMetadata(pluginId);
            const checksums = this.computeChecksums(contract, dimensionMetadata);
            
            // Build preview (per ADR-055: only dimensions_included and checksums, no dimension_counts)
            const preview = {
                contract_version: contract.contract_version,
                dimensions_included: dimensionMetadata.map(s => s.dimension),
                checksums: checksums?.dimensions || {}
            };
            
            // Compute artifact ID and checksum
            const snapshotJson = JSON.stringify({ contract, preview, checksums });
            const artifactId = crypto.createHash('sha256').update(snapshotJson).digest('hex').substring(0, 16);
            const checksum = crypto.createHash('sha256').update(snapshotJson).digest('hex').substring(0, 16);
            
            const snapshot: Snapshot = {
                artifact_id: artifactId,
                artifact_type: 'snapshot',
                snapshot_version: '1.0.0',
                snapshot_type: 'full',
                generated_at: new Date().toISOString(),
                checksum,
                preview,
                evidence: {
                    grade: 'INFERRED',
                    sources: [
                        {
                            type: 'CONTRACT',
                            id: contract.system_id,
                            path: 'system_contract',
                            hash: checksums?.contract || ''
                        }
                    ],
                    description: 'Snapshot reference generated from system contract and dimension metadata'
                }
            };
            
            // Expand requested dimensions
            if (expand.length > 0) {
                const dimensionSlices = await this.exportDimensionSlices(pluginId);
                snapshot.dimension_slices = dimensionSlices.filter(s => expand.includes(s.dimension));
                snapshot.checksums = checksums;
            }
            
            return snapshot;
        }
        
        // Full mode: export all data
        const dimensionSlices = await this.exportDimensionSlices(pluginId);
        const checksums = this.computeChecksums(contract, dimensionSlices);
        const rebuildInstructions = this.generateRebuildInstructions();

        const snapshot: Snapshot = {
            snapshot_version: '1.0.0',
            snapshot_type: 'full',
            generated_at: new Date().toISOString(),
            contract,
            dimension_slices: dimensionSlices,
            checksums,
            rebuild_instructions: rebuildInstructions
        };

        // Add code slices if requested
        if (includeCodeSlices) {
            snapshot.code_slices = await this.selectCodeSlices(pluginId, codeSlicePolicy, maxCodeBytes);
        }

        return snapshot;
    }

    /**
     * Exports delta snapshot (changes since last snapshot).
     * Uses T-Dimension to identify changes.
     * 
     * @param lastSnapshotHash Hash of last snapshot
     * @param pluginId Plugin ID (optional)
     * @param mode 'refs' (default) or 'full' - refs mode only returns references
     * @param expand Array of dimensions to expand (e.g., ['X', 'Y']) - only relevant in refs mode
     * @returns Snapshot
     */
    async exportDelta(
        lastSnapshotHash: string,
        pluginId?: string,
        mode: 'refs' | 'full' = 'refs',
        expand: string[] = []
    ): Promise<Snapshot> {
        const contract = await this.contractGenerator.generate(pluginId);
        
        // Get changes from T-Dimension since last snapshot
        const dbTools = (this.orchestrationTools as any).databaseTools;
        let changesSinceLastSnapshot: any[] = [];
        
        try {
            if (dbTools && dbTools.queryChanges) {
                const allChanges = await dbTools.queryChanges(pluginId) || [];
                const allChangesArray = Array.isArray(allChanges) ? allChanges : [allChanges];
                
                // Filter changes by timestamp (if available) or use all changes
                // In full implementation, we'd compare against lastSnapshotHash timestamp
                // For now, we use all changes as a simplified delta
                changesSinceLastSnapshot = allChangesArray;
            }
        } catch {
            // If changes query fails, fall back to full export
        }
        
        // In refs mode, only get metadata
        if (mode === 'refs') {
            const dimensionMetadata = await this.exportDimensionMetadata(pluginId);
            const checksums = this.computeChecksums(contract, dimensionMetadata);
            
            // Build preview (per ADR-055: only dimensions_included and checksums, no dimension_counts)
            const preview = {
                contract_version: contract.contract_version,
                dimensions_included: dimensionMetadata.map(s => s.dimension),
                checksums: checksums?.dimensions || {}
            };
            
            // Compute artifact ID and checksum
            const snapshotJson = JSON.stringify({ contract, preview, checksums, last_snapshot_hash: lastSnapshotHash });
            const artifactId = crypto.createHash('sha256').update(snapshotJson).digest('hex').substring(0, 16);
            const checksum = crypto.createHash('sha256').update(snapshotJson).digest('hex').substring(0, 16);
            
            const snapshot: Snapshot = {
                artifact_id: artifactId,
                artifact_type: 'snapshot',
                snapshot_version: '1.0.0',
                snapshot_type: 'delta',
                generated_at: new Date().toISOString(),
                checksum,
                preview,
                last_snapshot_hash: lastSnapshotHash,
                evidence: {
                    grade: 'INFERRED',
                    sources: [
                        {
                            type: 'CONTRACT',
                            id: contract.system_id,
                            path: 'system_contract',
                            hash: checksums?.contract || ''
                        }
                    ],
                    description: 'Delta snapshot reference generated from system contract and dimension metadata'
                }
            };
            
            // Expand requested dimensions
            if (expand.length > 0) {
                const dimensionSlices = await this.exportDimensionSlices(pluginId, true, changesSinceLastSnapshot);
                snapshot.dimension_slices = dimensionSlices.filter(s => expand.includes(s.dimension));
                snapshot.checksums = checksums;
            }
            
            return snapshot;
        }
        
        // Full mode: export all data
        const dimensionSlices = await this.exportDimensionSlices(pluginId, true, changesSinceLastSnapshot);
        const checksums = this.computeChecksums(contract, dimensionSlices);
        const rebuildInstructions = this.generateRebuildInstructions();

        return {
            snapshot_version: '1.0.0',
            snapshot_type: 'delta',
            generated_at: new Date().toISOString(),
            contract,
            dimension_slices: dimensionSlices,
            checksums,
            rebuild_instructions: rebuildInstructions,
            last_snapshot_hash: lastSnapshotHash
        };
    }

    /**
     * Exports dimension metadata (counts and checksums only, no data).
     * Used for refs mode to avoid context overflow.
     * 
     * @param pluginId Plugin ID (optional)
     * @returns Dimension metadata (counts and checksums)
     */
    private async exportDimensionMetadata(pluginId?: string): Promise<DimensionSlice[]> {
        const slices: DimensionSlice[] = [];

        // X-Dimension: Modules
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryAllModules) {
                const modules = await dbTools.queryAllModules(pluginId || '') || [];
                const modulesData = Array.isArray(modules) ? modules : [modules];
                slices.push({
                    dimension: 'X',
                    data: [],  // Empty data in refs mode
                    checksum: this.computeDataChecksum(modulesData),
                    count: modulesData.length
                });
            } else {
                console.warn(`[SnapshotExporter] X-Dimension: databaseTools or queryAllModules not available`);
                slices.push({ dimension: 'X', data: [], checksum: '', count: 0 });
            }
        } catch (error: any) {
            console.error(`[SnapshotExporter] X-Dimension error: ${error?.message || String(error)}`);
            slices.push({ dimension: 'X', data: [], checksum: '', count: 0 });
        }

        // Y-Dimension: Symbols
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.querySymbols) {
                const symbols = await dbTools.querySymbols({ pluginId: pluginId || '' }) || [];
                const symbolsData = Array.isArray(symbols) ? symbols : [symbols];
                slices.push({
                    dimension: 'Y',
                    data: [],  // Empty data in refs mode
                    checksum: this.computeDataChecksum(symbolsData),
                    count: symbolsData.length
                });
            } else {
                console.warn(`[SnapshotExporter] Y-Dimension: databaseTools or querySymbols not available`);
                slices.push({ dimension: 'Y', data: [], checksum: '', count: 0 });
            }
        } catch (error: any) {
            console.error(`[SnapshotExporter] Y-Dimension error: ${error?.message || String(error)}`);
            slices.push({ dimension: 'Y', data: [], checksum: '', count: 0 });
        }

        // Z-Dimension: Dependencies
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryDependencies) {
                const dependencies = await dbTools.queryDependencies({ pluginId: pluginId || '' }) || [];
                const dependenciesData = Array.isArray(dependencies) ? dependencies : [dependencies];
                slices.push({
                    dimension: 'Z',
                    data: [],  // Empty data in refs mode
                    checksum: this.computeDataChecksum(dependenciesData),
                    count: dependenciesData.length
                });
            } else {
                console.warn(`[SnapshotExporter] Z-Dimension: databaseTools or queryDependencies not available`);
                slices.push({ dimension: 'Z', data: [], checksum: '', count: 0 });
            }
        } catch (error: any) {
            console.error(`[SnapshotExporter] Z-Dimension error: ${error?.message || String(error)}`);
            slices.push({ dimension: 'Z', data: [], checksum: '', count: 0 });
        }

        // W-Dimension: ADRs
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryAllAdrs) {
                const adrs = await dbTools.queryAllAdrs(pluginId || '') || [];
                const adrsData = Array.isArray(adrs) ? adrs : [adrs];
                slices.push({
                    dimension: 'W',
                    data: [],  // Empty data in refs mode
                    checksum: this.computeDataChecksum(adrsData),
                    count: adrsData.length
                });
            } else {
                console.warn(`[SnapshotExporter] W-Dimension: databaseTools or queryAllAdrs not available`);
                slices.push({ dimension: 'W', data: [], checksum: '', count: 0 });
            }
        } catch (error: any) {
            console.error(`[SnapshotExporter] W-Dimension error: ${error?.message || String(error)}`);
            slices.push({ dimension: 'W', data: [], checksum: '', count: 0 });
        }

        // T-Dimension: Changes
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryAllChanges) {
                const changes = await dbTools.queryAllChanges(pluginId || '') || [];
                const changesData = Array.isArray(changes) ? changes : [changes];
                slices.push({
                    dimension: 'T',
                    data: [],  // Empty data in refs mode
                    checksum: this.computeDataChecksum(changesData),
                    count: changesData.length
                });
            } else {
                console.warn(`[SnapshotExporter] T-Dimension: databaseTools or queryAllChanges not available`);
                slices.push({ dimension: 'T', data: [], checksum: '', count: 0 });
            }
        } catch (error: any) {
            console.error(`[SnapshotExporter] T-Dimension error: ${error?.message || String(error)}`);
            slices.push({ dimension: 'T', data: [], checksum: '', count: 0 });
        }

        // V-Dimension: Embeddings (metadata only)
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryEmbeddings) {
                const embeddingsMetadata = await dbTools.queryEmbeddings(pluginId || '') || [];
                const embeddingsData = Array.isArray(embeddingsMetadata) ? embeddingsMetadata : [embeddingsMetadata];
                slices.push({
                    dimension: 'V',
                    data: [],  // Empty data in refs mode
                    checksum: this.computeDataChecksum(embeddingsData),
                    count: embeddingsData.length
                });
            } else {
                console.warn(`[SnapshotExporter] V-Dimension: databaseTools or queryEmbeddings not available`);
                slices.push({ dimension: 'V', data: [], checksum: '', count: 0 });
            }
        } catch (error: any) {
            console.error(`[SnapshotExporter] V-Dimension error: ${error?.message || String(error)}`);
            slices.push({ dimension: 'V', data: [], checksum: '', count: 0 });
        }

        return slices;
    }

    /**
     * Exports dimension slices from databases.
     * 
     * @param pluginId Plugin ID (optional)
     * @param deltaOnly If true, only export changes (requires T-Dimension)
     * @param changesSinceLastSnapshot Changes from T-Dimension (for delta mode)
     * @returns Dimension slices
     */
    private async exportDimensionSlices(
        pluginId?: string, 
        deltaOnly: boolean = false,
        changesSinceLastSnapshot: any[] = []
    ): Promise<DimensionSlice[]> {
        const slices: DimensionSlice[] = [];

        // X-Dimension: Modules
        try {
            // Access databaseTools via orchestrationTools
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryAllModules) {
                // Use queryAllModules to get all modules
                const modules = await dbTools.queryAllModules(pluginId || '') || [];
                const modulesData = Array.isArray(modules) ? modules : [modules];
                slices.push({
                    dimension: 'X',
                    data: modulesData,
                    checksum: this.computeDataChecksum(modulesData),
                    count: modulesData.length
                });
            } else {
                slices.push({
                    dimension: 'X',
                    data: [],
                    checksum: '',
                    count: 0
                });
            }
        } catch (error) {
            // Skip if not available
            slices.push({
                dimension: 'X',
                data: [],
                checksum: '',
                count: 0
            });
        }

        // Y-Dimension: Symbols
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.querySymbols) {
                const symbols = await dbTools.querySymbols({ pluginId: pluginId || '' }) || [];
                const symbolsData = Array.isArray(symbols) ? symbols : [symbols];
                // Debug: Log if empty
                if (symbolsData.length === 0 && pluginId) {
                    console.warn(`[SnapshotExporter] Y-Dimension: No symbols found for pluginId: ${pluginId}`);
                }
                slices.push({
                    dimension: 'Y',
                    data: symbolsData,
                    checksum: this.computeDataChecksum(symbolsData),
                    count: symbolsData.length
                });
            } else {
                slices.push({
                    dimension: 'Y',
                    data: [],
                    checksum: '',
                    count: 0
                });
            }
        } catch (error: any) {
            // Log error for debugging
            console.error(`[SnapshotExporter] Y-Dimension error: ${error?.message || String(error)}`);
            slices.push({
                dimension: 'Y',
                data: [],
                checksum: '',
                count: 0
            });
        }

        // Z-Dimension: Dependencies
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryDependencies) {
                const dependencies = await dbTools.queryDependencies({ pluginId: pluginId || '' }) || [];
                const dependenciesData = Array.isArray(dependencies) ? dependencies : [dependencies];
                // Debug: Log if empty
                if (dependenciesData.length === 0 && pluginId) {
                    console.warn(`[SnapshotExporter] Z-Dimension: No dependencies found for pluginId: ${pluginId}`);
                }
                slices.push({
                    dimension: 'Z',
                    data: dependenciesData,
                    checksum: this.computeDataChecksum(dependenciesData),
                    count: dependenciesData.length
                });
            } else {
                slices.push({
                    dimension: 'Z',
                    data: [],
                    checksum: '',
                    count: 0
                });
            }
        } catch (error: any) {
            // Log error for debugging
            console.error(`[SnapshotExporter] Z-Dimension error: ${error?.message || String(error)}`);
            slices.push({
                dimension: 'Z',
                data: [],
                checksum: '',
                count: 0
            });
        }

        // W-Dimension: ADRs
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryAllAdrs) {
                const adrs = await dbTools.queryAllAdrs(pluginId || '') || [];
                const adrsData = Array.isArray(adrs) ? adrs : [adrs];
                slices.push({
                    dimension: 'W',
                    data: adrsData,
                    checksum: this.computeDataChecksum(adrsData),
                    count: adrsData.length
                });
            } else {
                slices.push({
                    dimension: 'W',
                    data: [],
                    checksum: '',
                    count: 0
                });
            }
        } catch (error) {
            // Skip if not available
            slices.push({
                dimension: 'W',
                data: [],
                checksum: '',
                count: 0
            });
        }

        // T-Dimension: Changes
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryAllChanges) {
                const changes = await dbTools.queryAllChanges(pluginId || '') || [];
                const changesData = Array.isArray(changes) ? changes : [changes];
                slices.push({
                    dimension: 'T',
                    data: changesData,
                    checksum: this.computeDataChecksum(changesData),
                    count: changesData.length
                });
            } else {
                slices.push({
                    dimension: 'T',
                    data: [],
                    checksum: '',
                    count: 0
                });
            }
        } catch (error) {
            // Skip if not available
            slices.push({
                dimension: 'T',
                data: [],
                checksum: '',
                count: 0
            });
        }

        // V-Dimension: Embeddings (metadata only, not the actual vectors)
        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (dbTools && dbTools.queryEmbeddings) {
                const embeddingsMetadata = await dbTools.queryEmbeddings(pluginId || '') || [];
                const embeddingsData = Array.isArray(embeddingsMetadata) ? embeddingsMetadata : [embeddingsMetadata];
                // Debug: Log if empty
                if (embeddingsData.length === 0 && pluginId) {
                    console.warn(`[SnapshotExporter] V-Dimension: No embeddings found for pluginId: ${pluginId}`);
                }
                slices.push({
                    dimension: 'V',
                    data: embeddingsData,
                    checksum: this.computeDataChecksum(embeddingsData),
                    count: embeddingsData.length
                });
            } else {
                slices.push({
                    dimension: 'V',
                    data: [],
                    checksum: '',
                    count: 0
                });
            }
        } catch (error: any) {
            // Log error for debugging
            console.error(`[SnapshotExporter] V-Dimension error: ${error?.message || String(error)}`);
            slices.push({
                dimension: 'V',
                data: [],
                checksum: '',
                count: 0
            });
        }

        return slices;
    }

    /**
     * Computes checksums for contract and dimensions.
     */
    private computeChecksums(contract: SystemContract, slices: DimensionSlice[]): Snapshot['checksums'] {
        const contractChecksum = this.computeDataChecksum(contract);
        const dimensionChecksums: Record<string, string> = {};
        
        for (const slice of slices) {
            dimensionChecksums[slice.dimension] = slice.checksum;
        }

        return {
            contract: contractChecksum,
            dimensions: dimensionChecksums
        };
    }

    /**
     * Computes checksum for data.
     */
    private computeDataChecksum(data: any): string {
        const json = JSON.stringify(data);
        return crypto.createHash('sha256').update(json).digest('hex').substring(0, 16);
    }

    /**
     * Generates rebuild instructions.
     */
    private generateRebuildInstructions(): Snapshot['rebuild_instructions'] {
        return {
            steps: [
                '1. Ensure docs/ directory exists (run documentation generation if needed)',
                '2. Run ingestion: noyrax-5d-database ingest <workspace-root>',
                '3. Run embedding pipeline if V-Dimension is required: noyrax-5d-database-embedding <workspace-root>',
                '4. Verify snapshot integrity using checksums'
            ],
            prerequisites: [
                'Documentation System Plugin installed and compiled',
                '5D Database Plugin installed and compiled',
                'Workspace root matches snapshot workspace_root'
            ]
        };
    }

    /**
     * Writes snapshot to file.
     * 
     * @param snapshot Snapshot to write
     * @param outputPath Output file path
     */
    write(snapshot: Snapshot, outputPath: string): void {
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');
    }

    /**
     * Selects code slices for snapshot export.
     * Selects entry points, MCP tools, and critical paths with size limits.
     * 
     * @param pluginId Plugin ID (optional)
     * @param policy Selection policy
     * @param maxTotalBytes Maximum total bytes for all slices
     * @returns Code slices configuration
     */
    async selectCodeSlices(
        pluginId?: string,
        policy: 'ENTRY_POINTS' | 'MCP_TOOLS' | 'TOP_N' = 'MCP_TOOLS',
        maxTotalBytes: number = 102400
    ): Promise<Snapshot['code_slices']> {
        const slices: CodeSlice[] = [];
        let totalBytes = 0;

        try {
            const dbTools = (this.orchestrationTools as any).databaseTools;
            if (!dbTools || !dbTools.sourceSnippet) {
                // Source snippet API not available
                return {
                    inclusion_policy: 'NONE',
                    max_total_bytes: maxTotalBytes,
                    slices: []
                };
            }

            // Get entry points from system explanation
            if (policy === 'ENTRY_POINTS' || policy === 'MCP_TOOLS') {
                try {
                    const systemExplanation = await dbTools.systemExplanation(pluginId || '.');
                    const explanationJson = systemExplanation;
                    const entryPoints = explanationJson.entry_points || [];

                    for (const entryPoint of entryPoints.slice(0, 20)) { // Limit to top 20
                        if (totalBytes >= maxTotalBytes) break;

                        try {
                            const snippetResult = await dbTools.sourceSnippet({
                                symbol_id: entryPoint.symbol_id || entryPoint.externalId,
                                pluginId: pluginId || '.',
                                workspaceRoot: this.workspaceRoot,
                                include_context: false
                            });

                            const snippetJson = JSON.parse(snippetResult);
                            if (snippetJson.error) continue; // Skip errors

                            const slice: CodeSlice = {
                                file_path: snippetJson.file_path,
                                symbol_id: entryPoint.symbol_id || entryPoint.externalId || '',
                                start_line: snippetJson.core_start_line,
                                end_line: snippetJson.core_end_line,
                                snippet: snippetJson.snippet,
                                content_hash: snippetJson.content_hash,
                                byte_size: snippetJson.byte_size,
                                reason: policy === 'MCP_TOOLS' ? 'MCP_TOOL' : 'ENTRY_POINT'
                            };

                            if (totalBytes + slice.byte_size <= maxTotalBytes) {
                                slices.push(slice);
                                totalBytes += slice.byte_size;
                            }
                        } catch {
                            // Skip if snippet fetch fails
                        }
                    }
                } catch {
                    // Skip if system explanation fails
                }
            }

            return {
                inclusion_policy: policy,
                max_total_bytes: maxTotalBytes,
                slices
            };
        } catch {
            return {
                inclusion_policy: 'NONE',
                max_total_bytes: maxTotalBytes,
                slices: []
            };
        }
    }

    /**
     * Exports snapshot and writes to file.
     * 
     * @param outputPath Output file path
     * @param delta If true, export delta snapshot (requires lastSnapshotHash)
     * @param lastSnapshotHash Hash of last snapshot (for delta)
     * @param pluginId Plugin ID (optional)
     * @param mode 'refs' (default) or 'full' - refs mode only returns references
     * @param expand Array of dimensions to expand (e.g., ['X', 'Y']) - only relevant in refs mode
     * @param includeCodeSlices If true, include selective code slices (default: false, only in full mode)
     */
    async export(
        outputPath: string,
        delta: boolean = false,
        lastSnapshotHash?: string,
        pluginId?: string,
        mode: 'refs' | 'full' = 'refs',
        expand: string[] = [],
        includeCodeSlices: boolean = false
    ): Promise<void> {
        const snapshot = delta && lastSnapshotHash
            ? await this.exportDelta(lastSnapshotHash, pluginId, mode, expand)
            : await this.exportFull(pluginId, mode, expand, includeCodeSlices);
        
        // Add file_path when exported to file
        snapshot.file_path = outputPath;
        
        this.write(snapshot, outputPath);
    }
}

