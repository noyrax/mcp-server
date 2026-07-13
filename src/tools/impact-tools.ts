/**
 * Impact Analysis Tool
 * 
 * Analysiert die Auswirkungen einer Änderung.
 * Migriert aus documentation-system-plugin/mcp/src/tools/impact.ts
 * @public
 */

import * as path from 'node:path';
import * as readline from 'node:readline';
import { createReadStream } from 'node:fs';

export interface ImpactRequest {
  file: string;
  symbol?: string;
  workspaceRoot: string; // Required: Workspace root directory
}

export interface ImpactResponse {
  file: string;
  symbol?: string;
  directDependents: string[];
  transitiveDependents: string[];
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

interface SymbolEntry {
  file: string;
  name: string;
  type: string;
  dependencies?: string[];
  dependents?: string[];
}

/**
 * Analysiert die Auswirkungen einer Änderung.
 * @public
 */
export async function analyzeImpact(request: ImpactRequest): Promise<ImpactResponse> {
  const { file, symbol, workspaceRoot } = request;
  const directDependents: Set<string> = new Set();
  const transitiveDependents: Set<string> = new Set();

  try {
    // Symbol-Index lesen
    // WICHTIG: docs/ muss im Workspace-Root sein (wird von Noyrax generiert)
    const symbolsPath = path.join(workspaceRoot, 'docs', 'index', 'symbols.jsonl');
    const dependencyMap = await buildDependencyMap(symbolsPath);

    // Direkte Abhängige finden
    const normalizedFile = file.replace(/\\/g, '/');
    for (const [dependentFile, dependencies] of dependencyMap.entries()) {
      if (dependencies.has(normalizedFile)) {
        directDependents.add(dependentFile);
      }
    }

    // Transitive Abhängige finden (BFS)
    const queue = [...directDependents];
    const visited = new Set(directDependents);

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      for (const [dependentFile, dependencies] of dependencyMap.entries()) {
        if (dependencies.has(current) && !visited.has(dependentFile)) {
          visited.add(dependentFile);
          transitiveDependents.add(dependentFile);
          queue.push(dependentFile);
        }
      }
    }

    // Impact-Level berechnen
    const totalDependents = directDependents.size + transitiveDependents.size;
    const { impactLevel, recommendation } = calculateImpact(totalDependents);

    return {
      file,
      symbol,
      directDependents: [...directDependents].sort((a, b) => a.localeCompare(b)),
      transitiveDependents: [...transitiveDependents].sort((a, b) => a.localeCompare(b)),
      impactLevel,
      recommendation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      file,
      symbol,
      directDependents: [],
      transitiveDependents: [],
      impactLevel: 'low',
      recommendation: `Impact-Analyse fehlgeschlagen: ${message}`,
    };
  }
}

/**
 * Berechnet das Impact-Level basierend auf der Anzahl der Abhängigen.
 */
function calculateImpact(totalDependents: number): { 
  impactLevel: 'low' | 'medium' | 'high' | 'critical'; 
  recommendation: string;
} {
  if (totalDependents === 0) {
    return {
      impactLevel: 'low',
      recommendation: 'Keine Abhängigkeiten gefunden. Änderung kann sicher durchgeführt werden.',
    };
  }
  if (totalDependents <= 2) {
    return {
      impactLevel: 'medium',
      recommendation: 'Wenige Abhängigkeiten. Tests für abhängige Module empfohlen.',
    };
  }
  if (totalDependents <= 5) {
    return {
      impactLevel: 'high',
      recommendation: 'Mehrere Abhängigkeiten. Sorgfältige Prüfung und vollständiger Testlauf erforderlich.',
    };
  }
  return {
    impactLevel: 'critical',
    recommendation: 'Kritische Änderung mit vielen Abhängigkeiten. ADR empfohlen. Vollständige Validierung Pflicht.',
  };
}

/**
 * Baut eine Map der Abhängigkeiten aus dem Symbol-Index.
 */
async function buildDependencyMap(symbolsPath: string): Promise<Map<string, Set<string>>> {
  const dependencyMap = new Map<string, Set<string>>();

  try {
    const fileStream = createReadStream(symbolsPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      
      try {
        const entry: SymbolEntry = JSON.parse(line);
        
        if (entry.dependencies && entry.dependencies.length > 0) {
          if (!dependencyMap.has(entry.file)) {
            dependencyMap.set(entry.file, new Set());
          }
          
          for (const dep of entry.dependencies) {
            dependencyMap.get(entry.file)!.add(dep);
          }
        }
      } catch {
        // Zeile überspringen bei Parse-Fehlern
      }
    }
  } catch {
    // Fallback: Leere Map zurückgeben
  }

  return dependencyMap;
}

