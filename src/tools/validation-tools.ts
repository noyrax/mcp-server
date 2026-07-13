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
     * Note: This is now a local function and doesn't require the plugin to be available.
     */
    public async runDriftCheck(args: {
        since?: string;
    } = {}): Promise<any> {
        // No longer requires plugin availability - uses local function
        return await this.adapter.runDriftCheck(args);
    }

    /**
     * Analyzes impact.
     * Note: This is now a local function and doesn't require the plugin to be available.
     */
    public async analyzeImpact(args: {
        file: string;
        symbol?: string;
    }): Promise<any> {
        // No longer requires plugin availability - uses local function
        return await this.adapter.analyzeImpact(args);
    }

    /**
     * Verifies ADRs.
     * Note: This uses the verify-adrs.js script, but should work even if plugin is not fully available.
     */
    public async verifyAdrs(args: {
        verbose?: boolean;
    } = {}): Promise<any> {
        // verifyAdrs uses the script, which should be available if plugin path exists
        // Even if plugin is not fully compiled, the script might still work
        if (!this.adapter.getPluginPath()) {
            throw new Error('Documentation System Plugin path not found');
        }

        return await this.adapter.verifyAdrs(args);
    }
}

