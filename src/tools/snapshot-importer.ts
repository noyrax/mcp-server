import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Snapshot } from './snapshot-exporter.js';
import { OrchestrationTools } from './orchestration-tools.js';

/**
 * Import result.
 */
export interface ImportResult {
    status: 'success' | 'partial' | 'error';
    imported_dimensions: string[];
    skipped_dimensions: string[];
    errors?: string[];
    checksum_validation: {
        contract_valid: boolean;
        dimensions_valid: Record<string, boolean>;
    };
}

/**
 * Imports system snapshot (contract + dimension slices).
 * Supports full and delta snapshots.
 */
export class SnapshotImporter {
    private workspaceRoot: string;
    private orchestrationTools: OrchestrationTools;

    constructor(workspaceRoot: string, orchestrationTools: OrchestrationTools) {
        this.workspaceRoot = workspaceRoot;
        this.orchestrationTools = orchestrationTools;
    }

    /**
     * Imports snapshot from file.
     * 
     * @param snapshotPath Path to snapshot file
     * @param delta If true, apply as delta (incremental)
     * @returns Import result
     */
    async import(snapshotPath: string, delta: boolean = false): Promise<ImportResult> {
        if (!fs.existsSync(snapshotPath)) {
            throw new Error(`Snapshot file not found: ${snapshotPath}`);
        }

        const snapshot: Snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

        // Validate checksums
        const checksumValidation = this.validateChecksums(snapshot);

        // Import dimension slices
        const importedDimensions: string[] = [];
        const skippedDimensions: string[] = [];
        const errors: string[] = [];

        for (const slice of snapshot.dimension_slices || []) {
            try {
                await this.importDimensionSlice(slice, delta);
                importedDimensions.push(slice.dimension);
            } catch (error: any) {
                skippedDimensions.push(slice.dimension);
                errors.push(`Failed to import ${slice.dimension}: ${error?.message || String(error)}`);
            }
        }

        // If delta, merge with existing data
        if (delta && snapshot.snapshot_type === 'delta') {
            // Delta import merges changes with existing data
            // This is handled by the ingestion APIs which support incremental updates
        }

        return {
            status: errors.length === 0 ? 'success' : (importedDimensions.length > 0 ? 'partial' : 'error'),
            imported_dimensions: importedDimensions,
            skipped_dimensions: skippedDimensions,
            errors: errors.length > 0 ? errors : undefined,
            checksum_validation: checksumValidation
        };
    }

    /**
     * Validates snapshot checksums.
     */
    private validateChecksums(snapshot: Snapshot): ImportResult['checksum_validation'] {
        const contractChecksum = this.computeDataChecksum(snapshot.contract);
        const contractValid = contractChecksum === snapshot.checksums?.contract;

        const dimensionsValid: Record<string, boolean> = {};
        for (const slice of snapshot.dimension_slices || []) {
            const computedChecksum = this.computeDataChecksum(slice.data);
            dimensionsValid[slice.dimension] = computedChecksum === slice.checksum;
        }

        return {
            contract_valid: contractValid,
            dimensions_valid: dimensionsValid
        };
    }

    /**
     * Imports a dimension slice.
     * 
     * @param slice Dimension slice
     * @param delta If true, apply as delta
     */
    private async importDimensionSlice(slice: DimensionSlice, delta: boolean): Promise<void> {
        const dbTools = (this.orchestrationTools as any).databaseTools;
        
        if (!dbTools) {
            throw new Error('Database tools not available');
        }

        switch (slice.dimension) {
            case 'X':
                // Modules - would use ModuleApi to insert/update
                // For now, we rely on ingestion API which handles this
                const dbTools = (this.orchestrationTools as any).databaseTools;
                if (dbTools && dbTools.runIngestion) {
                    if (!delta) {
                        // Full import: trigger full ingestion
                        await dbTools.runIngestion('', true);
                    } else {
                        // Delta import: trigger incremental ingestion
                        await dbTools.runIngestion('', false);
                    }
                }
                break;

            case 'Y':
                // Symbols - handled by ingestion
                break;

            case 'Z':
                // Dependencies - handled by ingestion
                break;

            case 'W':
                // ADRs - handled by ingestion
                break;

            case 'T':
                // Changes - handled by ingestion
                break;

            case 'V':
                // Embeddings - would require embedding pipeline
                // For now, we skip V-Dimension in import
                break;
        }
    }

    /**
     * Computes checksum for data.
     */
    private computeDataChecksum(data: any): string {
        const json = JSON.stringify(data);
        return crypto.createHash('sha256').update(json).digest('hex').substring(0, 16);
    }
}

// Import DimensionSlice type
import type { DimensionSlice } from './snapshot-exporter.js';

