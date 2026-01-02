/**
 * Helper class for testing MCP Server via stdio (JSON-RPC 2.0).
 * Spawns the server process and communicates via stdin/stdout.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number | string | null;
    method: string;
    params?: any;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

export class McpClientHelper {
    private serverProcess: ChildProcess | null = null;
    private requestIdCounter: number = 1;
    private pendingRequests: Map<number | string, {
        resolve: (value: JsonRpcResponse) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();
    private stdoutBuffer: string = '';
    private stderrBuffer: string = '';
    private readonly timeout: number = 10000; // 10 seconds

    /**
     * Starts the MCP server process.
     */
    public async start(workspaceRoot: string): Promise<void> {
        if (this.serverProcess) {
            throw new Error('Server already started');
        }

        const serverCliPath = path.resolve(__dirname, '../../out/cli/server-cli.js');
        
        // Check if server CLI exists
        if (!fs.existsSync(serverCliPath)) {
            throw new Error(`Server CLI not found: ${serverCliPath}. Please run 'npm run compile' first.`);
        }

        this.serverProcess = spawn('node', [serverCliPath, workspaceRoot], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Handle stdout (JSON-RPC responses)
        this.serverProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            // Filter out non-JSON lines (log messages, etc.)
            // JSON-RPC messages should start with { or be valid JSON
            if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                this.stdoutBuffer += text;
                this.processBuffer();
            } else {
                // Log messages go to stderr buffer for debugging
                this.stderrBuffer += text;
            }
        });

        // Handle stderr (errors, logs)
        this.serverProcess.stderr?.on('data', (data: Buffer) => {
            this.stderrBuffer += data.toString();
        });

        // Handle process exit
        this.serverProcess.on('exit', (code) => {
            if (code !== null && code !== 0) {
                // Reject all pending requests
                for (const [id, pending] of this.pendingRequests.entries()) {
                    clearTimeout(pending.timeout);
                    pending.reject(new Error(`Server exited with code ${code}. Stderr: ${this.stderrBuffer}`));
                }
                this.pendingRequests.clear();
            }
        });

        // Wait a bit for server to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    /**
     * Stops the MCP server process.
     */
    public async stop(): Promise<void> {
        if (this.serverProcess) {
            this.serverProcess.kill();
            this.serverProcess = null;
            this.stdoutBuffer = '';
            this.stderrBuffer = '';
            
            // Clear all pending requests
            for (const [id, pending] of this.pendingRequests.entries()) {
                clearTimeout(pending.timeout);
                pending.reject(new Error('Server stopped'));
            }
            this.pendingRequests.clear();
        }
    }

    /**
     * Sends a JSON-RPC request and waits for response.
     */
    public async sendRequest(method: string, params?: any): Promise<JsonRpcResponse> {
        if (!this.serverProcess) {
            throw new Error('Server not started');
        }

        const id = this.requestIdCounter++;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise<JsonRpcResponse>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timeout: ${method}`));
            }, this.timeout);

            this.pendingRequests.set(id, { resolve, reject, timeout });

            const requestJson = JSON.stringify(request) + '\n';
            this.serverProcess!.stdin?.write(requestJson);
        });
    }

    /**
     * Processes the stdout buffer, extracting complete JSON-RPC messages.
     */
    private processBuffer(): void {
        // JSON-RPC messages are separated by newlines
        const lines = this.stdoutBuffer.split('\n');
        this.stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }

            // Some libraries log to stdout. Only treat JSON lines as JSON-RPC.
            if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
                this.stderrBuffer += line + '\n';
                continue;
            }

            try {
                const response: JsonRpcResponse = JSON.parse(line);
                this.handleResponse(response);
            } catch (error) {
                // If parsing fails, store it for debugging but don't fail tests.
                this.stderrBuffer += line + '\n';
            }
        }
    }

    /**
     * Handles a JSON-RPC response.
     */
    private handleResponse(response: JsonRpcResponse): void {
        if (response.id === null) {
            // Notification (no response expected)
            return;
        }

        const pending = this.pendingRequests.get(response.id);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
        }
    }

    /**
     * Gets stderr output (for debugging).
     */
    public getStderr(): string {
        return this.stderrBuffer;
    }
}

