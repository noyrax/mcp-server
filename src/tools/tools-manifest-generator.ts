import * as path from 'path';
import * as fs from 'fs';
import { SystemContract } from './system-contract-generator.js';

/**
 * Tool manifest entry.
 */
export interface ToolManifestEntry {
    name: string;
    version?: string;
    description: string;
    input_schema?: any;
    output_schema?: any;
    required_params?: string[];
    optional_params?: string[];
    examples?: Array<{
        input: any;
        output: any;
    }>;
}

/**
 * Tools manifest structure.
 */
export interface ToolsManifest {
    version: string;
    generated_at: string;
    tools: ToolManifestEntry[];
}

/**
 * Generates tools manifest from system contract.
 */
export class ToolsManifestGenerator {
    /**
     * Generates tools manifest from system contract.
     * 
     * @param contract System contract
     * @returns Tools manifest
     */
    generate(contract: SystemContract): ToolsManifest {
        const tools: ToolManifestEntry[] = contract.capabilities.tools.map(tool => ({
            name: tool.name,
            version: tool.version,
            description: tool.description,
            input_schema: tool.input_schema,
            output_schema: tool.output_schema,
            required_params: tool.required_params,
            optional_params: tool.optional_params,
            examples: this.generateExamples(tool.name)
        }));

        return {
            version: contract.contract_version,
            generated_at: new Date().toISOString(),
            tools
        };
    }

    /**
     * Generates example inputs/outputs for a tool.
     * 
     * @param toolName Tool name
     * @returns Example array
     */
    private generateExamples(toolName: string): Array<{ input: any; output: any }> {
        const examples: Array<{ input: any; output: any }> = [];

        switch (toolName) {
            case 'query_modules':
                examples.push({
                    input: { filePath: 'src/api/module-api.ts', pluginId: '.' },
                    output: { id: '...', file_path: 'src/api/module-api.ts', content_markdown: '...' }
                });
                break;

            case 'query_adrs':
                examples.push({
                    input: { adrNumberOrPath: '025', pluginId: '.' },
                    output: { id: '...', number: 25, title: '...', content_markdown: '...' }
                });
                break;

            case 'semantic_discovery':
                examples.push({
                    input: { query: 'How does the ContextBuilder work?', pluginId: '.', limit: 5 },
                    output: { results: [{ type: 'MODULE', id: '...', relevance: 0.95 }] }
                });
                break;

            case 'vector_backend_status':
                examples.push({
                    input: { pluginId: '.' },
                    output: {
                        is_available: true,
                        backend_name: 'ChromaDbVectorDatabase',
                        status_message: 'ChromaDB is available and operational.',
                        reason_code: 'OK'
                    }
                });
                break;

            case 'system_contract':
                examples.push({
                    input: { pluginId: '.' },
                    output: { 
                        contract: { 
                            system_id: '...', 
                            contract_version: '1.0.0',
                            dimensions: {},
                            capabilities: {}
                        },
                        generated_at: '2024-01-01T00:00:00.000Z',
                        sources: []
                    }
                });
                break;
        }

        return examples;
    }

    /**
     * Writes tools manifest to file.
     * 
     * @param contract System contract
     * @param outputPath Output file path
     */
    write(contract: SystemContract, outputPath: string): void {
        const manifest = this.generate(contract);
        
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
    }
}

