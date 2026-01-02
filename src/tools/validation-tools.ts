import { DocumentationPluginAdapter } from '../plugins/documentation-plugin-adapter.js';

/**
 * Validation tools wrapper for Documentation System Plugin.
 * Provides access to validation functionality via plugin adapter.
 */
export class ValidationTools {
    private adapter: DocumentationPluginAdapter;

    constructor(adapter: DocumentationPluginAdapter) {
        this.adapter = adapter;
    }

    /**
     * Runs scan.
     */
    public async runScan(args: {
        files?: string[];
        incremental?: boolean;
    } = {}): Promise<any> {
        if (!this.adapter.isAvailable()) {
            throw new Error('Documentation System Plugin is not available');
        }

        return await this.adapter.runScan(args);
    }

    /**
     * Runs validate.
     */
    public async runValidate(args: {
        files?: string[];
        verbose?: boolean;
    } = {}): Promise<any> {
        if (!this.adapter.isAvailable()) {
            throw new Error('Documentation System Plugin is not available');
        }

        return await this.adapter.runValidate(args);
    }

    /**
     * Runs generate.
     */
    public async runGenerate(args: {
        outputPath?: string;
        full?: boolean;
        verbose?: boolean;
    } = {}): Promise<any> {
        if (!this.adapter.isAvailable()) {
            throw new Error('Documentation System Plugin is not available');
        }

        return await this.adapter.runGenerate(args);
    }

    /**
     * Runs drift check.
     */
    public async runDriftCheck(args: {
        since?: string;
    } = {}): Promise<any> {
        if (!this.adapter.isAvailable()) {
            throw new Error('Documentation System Plugin is not available');
        }

        return await this.adapter.runDriftCheck(args);
    }

    /**
     * Analyzes impact.
     */
    public async analyzeImpact(args: {
        file: string;
        symbol?: string;
    }): Promise<any> {
        if (!this.adapter.isAvailable()) {
            throw new Error('Documentation System Plugin is not available');
        }

        return await this.adapter.analyzeImpact(args);
    }

    /**
     * Verifies ADRs.
     */
    public async verifyAdrs(args: {
        verbose?: boolean;
    } = {}): Promise<any> {
        if (!this.adapter.isAvailable()) {
            throw new Error('Documentation System Plugin is not available');
        }

        return await this.adapter.verifyAdrs(args);
    }
}

