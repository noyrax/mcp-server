import { AgentPluginAdapter } from '../../plugins/agent-plugin-adapter';

/**
 * Mock AgentPluginAdapter for unit tests.
 */
export class MockAgentPluginAdapter extends AgentPluginAdapter {
    private mockAvailable: boolean = true;
    private mockPluginPath: string | undefined = '/mock/agent-5d-system';
    private mockDbManager: any;

    constructor(workspaceRoot: string, mockDbManager?: any) {
        super(workspaceRoot);
        this.mockDbManager = mockDbManager;
    }

    public setAvailable(available: boolean): void {
        this.mockAvailable = available;
    }

    public setPluginPath(path: string | undefined): void {
        this.mockPluginPath = path;
    }

    public setMockDbManager(dbManager: any): void {
        this.mockDbManager = dbManager;
    }

    public override isAvailable(): boolean {
        return this.mockAvailable;
    }

    public override getPluginPath(): string | undefined {
        return this.mockPluginPath;
    }

    public override async createAgentMultiDbManager(): Promise<any> {
        if (!this.mockDbManager) {
            throw new Error('Mock dbManager not set');
        }
        return this.mockDbManager;
    }
}

/**
 * Creates a mock AgentPluginAdapter for testing.
 */
export function createMockAgentPluginAdapter(
    workspaceRoot: string,
    mockDbManager?: any
): MockAgentPluginAdapter {
    return new MockAgentPluginAdapter(workspaceRoot, mockDbManager);
}
