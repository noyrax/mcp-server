/**
 * Drift Check Tool
 * 
 * Prüft auf Drift zwischen Code und Dokumentation.
 * Migriert aus documentation-system-plugin/mcp/src/tools/drift.ts
 * @public
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const execAsync = promisify(exec);

export interface DriftRequest {
  since?: string;
  workspaceRoot: string; // Required: Workspace root directory
}

export interface DriftItem {
  file: string;
  type: 'signature_mismatch' | 'new_file' | 'deleted_file' | 'modified';
  expected?: string;
  found?: string;
  message: string;
}

export interface DriftResponse {
  status: 'clean' | 'drift_detected';
  drifted: DriftItem[];
  changedFiles: string[];
  duration: number;
}

/**
 * Prüft auf Drift zwischen Code und Dokumentation.
 * @public
 */
export async function runDriftCheck(request: DriftRequest): Promise<DriftResponse> {
  const startTime = Date.now();
  const since = request.since || 'HEAD~1';
  const workspaceRoot = request.workspaceRoot;
  const drifted: DriftItem[] = [];

  try {
    // Git-Änderungen seit der Referenz abrufen
    const { stdout: gitDiff } = await execAsync(
      `git diff --name-status ${since}`,
      { cwd: workspaceRoot }
    );

    const changedFiles: string[] = [];
    const lines = gitDiff.split('\n').filter(Boolean);
    const sourceFileRegex = /\.(ts|js|py)$/;

    for (const line of lines) {
      const [status, filePath] = line.split('\t');
      
      // Nur Source-Dateien berücksichtigen
      if (!filePath?.startsWith('src/') || !sourceFileRegex.test(filePath)) {
        continue;
      }

      changedFiles.push(filePath);

      switch (status) {
        case 'A': // Added
          drifted.push({
            file: filePath,
            type: 'new_file',
            message: `New file added: ${filePath}`,
          });
          break;

        case 'D': // Deleted
          drifted.push({
            file: filePath,
            type: 'deleted_file',
            message: `File deleted: ${filePath}`,
          });
          break;

        case 'M': {
          // Modified - Prüfen ob Dokumentation existiert und aktuell ist
          const docPath = getDocPath(filePath, workspaceRoot);
          try {
            await fs.access(docPath);
            // Dokumentation existiert - könnte veraltet sein
            drifted.push({
              file: filePath,
              type: 'modified',
              message: `File modified, documentation may be outdated: ${filePath}`,
            });
          } catch {
            // Dokumentation fehlt
            drifted.push({
              file: filePath,
              type: 'new_file',
              message: `Modified file has no documentation: ${filePath}`,
            });
          }
          break;
        }
      }
    }

    return {
      status: drifted.length > 0 ? 'drift_detected' : 'clean',
      drifted,
      changedFiles,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      status: 'drift_detected',
      drifted: [{
        file: '',
        type: 'modified',
        message: `Drift check failed: ${message}`,
      }],
      changedFiles: [],
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Konvertiert einen Source-Pfad in den entsprechenden Dokumentations-Pfad.
 * @param sourcePath Source file path (e.g., "src/parsers/ts-js.ts")
 * @param workspaceRoot Workspace root directory
 * @returns Absolute path to documentation file
 */
function getDocPath(sourcePath: string, workspaceRoot: string): string {
  // src/parsers/ts-js.ts → docs/modules/src__parsers__ts-js.ts.md
  const normalized = sourcePath.replace(/\//g, '__');
  // WICHTIG: docs/ muss im Workspace-Root sein (wird von Noyrax generiert)
  return path.join(workspaceRoot, 'docs', 'modules', `${normalized}.md`);
}

