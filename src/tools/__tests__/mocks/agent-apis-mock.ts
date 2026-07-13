/**
 * Mock Agent-APIs for unit tests.
 */

export class MockAgentApi {
    private agents: Map<string, any> = new Map();

    public setAgent(id: string, agent: any): void {
        this.agents.set(id, agent);
    }

    public async getAgentById(id: string, pluginId: string): Promise<any | null> {
        return this.agents.get(id) || null;
    }

    public async getAgentByPath(filePath: string, pluginId: string): Promise<any | null> {
        for (const agent of this.agents.values()) {
            if (agent.file_path === filePath) {
                return agent;
            }
        }
        return null;
    }

    public async getAllAgents(pluginId: string): Promise<any[]> {
        return Array.from(this.agents.values());
    }
}

export class MockAgentComponentApi {
    private components: Map<string, any> = new Map();

    public setComponent(id: string, component: any): void {
        this.components.set(id, component);
    }

    public async getComponentById(id: string, pluginId: string): Promise<any | null> {
        return this.components.get(id) || null;
    }

    public async getComponentByComponentId(componentId: string, pluginId: string): Promise<any | null> {
        for (const component of this.components.values()) {
            if (component.component_id === componentId) {
                return component;
            }
        }
        return null;
    }

    public async getComponentsByAgentPath(agentPath: string, pluginId: string): Promise<any[]> {
        return Array.from(this.components.values()).filter((c: any) => c.agent_path === agentPath);
    }

    public async getAllComponents(pluginId: string): Promise<any[]> {
        return Array.from(this.components.values());
    }
}

export class MockAgentDependencyApi {
    private dependencies: any[] = [];

    public setDependencies(deps: any[]): void {
        this.dependencies = deps;
    }

    public async getAllDependencies(pluginId: string): Promise<any[]> {
        return this.dependencies;
    }

    public async getDependenciesFromComponent(componentId: string, pluginId: string): Promise<any[]> {
        return this.dependencies.filter((d: any) => d.from_component_id === componentId);
    }

    public async getDependenciesToComponent(componentId: string, pluginId: string): Promise<any[]> {
        return this.dependencies.filter((d: any) => d.to_component_id === componentId);
    }
}

export class MockAgentDecisionApi {
    private decisions: Map<string, any> = new Map();
    private mappings: Map<string, any[]> = new Map();

    public setDecision(number: string, decision: any): void {
        this.decisions.set(number, decision);
    }

    public setMappings(decisionId: string, mappings: any[]): void {
        this.mappings.set(decisionId, mappings);
    }

    public async getDecisionByNumber(decisionNumber: string, pluginId: string): Promise<any | null> {
        return this.decisions.get(decisionNumber) || null;
    }

    public async getAllDecisions(pluginId: string): Promise<any[]> {
        return Array.from(this.decisions.values());
    }

    public async getDecisionsByAgentPath(agentPath: string, pluginId: string): Promise<any[]> {
        const result: any[] = [];
        for (const decision of this.decisions.values()) {
            const mappings = this.mappings.get(decision.id) || [];
            if (mappings.some((m: any) => m.agent_path === agentPath)) {
                result.push(decision);
            }
        }
        return result;
    }
}

export class MockAgentChangeApi {
    private changeReports: any[] = [];

    public setChangeReports(reports: any[]): void {
        this.changeReports = reports;
    }

    public async getAllChangeReports(pluginId: string): Promise<any[]> {
        return this.changeReports;
    }

    public async getLatestChangeReport(pluginId: string): Promise<any | null> {
        if (this.changeReports.length === 0) {
            return null;
        }
        // Return the one with latest created_at
        return this.changeReports.reduce((latest, current) => {
            return current.created_at > latest.created_at ? current : latest;
        });
    }
}

export class MockAgentCrossDimensionApi {
    private mockAnalysis: any = null;

    public setCrossAnalysis(analysis: any): void {
        this.mockAnalysis = analysis;
    }

    public async getCrossAnalysis(agentPath: string, pluginId: string): Promise<any> {
        return this.mockAnalysis || {
            agent: null,
            components: [],
            dependencies: [],
            decisions: [],
            changes: []
        };
    }
}
