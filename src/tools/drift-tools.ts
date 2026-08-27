/**
 * Drift Check Tool
 *
 * Prüft, ob der indizierte Wissensstand noch zum Code passt.
 * Migriert aus documentation-system-plugin/mcp/src/tools/drift.ts
 * @public
 *
 * Zwei unabhängige Prüfungen mit verschiedenen Fragen:
 *
 *  - Index-Prüfung (primär): Stimmt der gespeicherte source_hash jedes Moduls
 *    noch mit der Datei auf der Platte überein? Beantwortet "ist die Datenbank
 *    veraltet?" und funktioniert unabhängig von git, also auch bei
 *    uncommitteten Änderungen.
 *  - Git-Prüfung (sekundär): Was hat sich seit einem Referenzpunkt geändert?
 *
 * Zentrale Regel: Was nicht geprüft werden konnte, wird als `unknown` gemeldet
 * und nie als `clean`. Eine falsche Entwarnung ist schlimmer als keine Aussage.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const execAsync = promisify(exec);

/**
 * Ein Modul so, wie es in der X-Dimension steht.
 * `source_hash === null` heißt "vor Migration 001_add_source_hash_modules
 * ingestet oder Quelldatei war nicht lesbar" — nicht "unverändert".
 */
export interface IndexedModule {
  file_path: string;
  source_hash: string | null;
}

export interface DriftRequest {
  since?: string;
  workspaceRoot: string; // Required: Workspace root directory
  /**
   * Indexstand aus der X-Dimension. Fehlt er, kann die Index-Prüfung nicht
   * laufen und das Ergebnis ist bestenfalls `unknown`.
   */
  modules?: IndexedModule[];
}

export interface DriftItem {
  file: string;
  type:
    | 'signature_mismatch'
    | 'new_file'
    | 'deleted_file'
    | 'modified'
    | 'stale_index'
    | 'unknown_index';
  expected?: string;
  found?: string;
  message: string;
}

export interface DriftIndexReport {
  /** Konnte die Index-Prüfung überhaupt laufen? */
  available: boolean;
  totalIndexed: number;
  checked: number;
  staleCount: number;
  unknownCount: number;
  reason?: string;
}

export interface DriftGitReport {
  available: boolean;
  since: string;
  changedFiles: string[];
  reason?: string;
}

export interface DriftResponse {
  status: 'clean' | 'drift_detected' | 'unknown';
  drifted: DriftItem[];
  /** Aggregiert aus beiden Prüfungen; bleibt für Bestandsaufrufer erhalten. */
  changedFiles: string[];
  index: DriftIndexReport;
  git: DriftGitReport;
  duration: number;
}

const SOURCE_FILE_REGEX = /\.(ts|js|py)$/;

/**
 * Hash einer Quelldatei — muss exakt der Berechnung im ModuleIngestor
 * entsprechen (SHA256 über den als UTF-8 gelesenen Dateiinhalt), sonst
 * schlägt der Vergleich immer an.
 */
function hashSource(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Vergleicht den indizierten Stand gegen die Dateien auf der Platte.
 */
async function checkIndexFreshness(
  modules: IndexedModule[] | undefined,
  workspaceRoot: string,
  drifted: DriftItem[]
): Promise<DriftIndexReport> {
  if (!modules) {
    return {
      available: false,
      totalIndexed: 0,
      checked: 0,
      staleCount: 0,
      unknownCount: 0,
      reason:
        'No index snapshot supplied. Index freshness could not be verified — this is not a clean result.',
    };
  }

  if (modules.length === 0) {
    return {
      available: false,
      totalIndexed: 0,
      checked: 0,
      staleCount: 0,
      unknownCount: 0,
      reason:
        'Index is empty. Nothing to compare against — run an ingest before trusting a drift result.',
    };
  }

  let checked = 0;
  let staleCount = 0;
  let unknownCount = 0;

  for (const module of modules) {
    const filePath = module.file_path;

    if (!module.source_hash) {
      unknownCount++;
      drifted.push({
        file: filePath,
        type: 'unknown_index',
        message: `No source_hash stored for ${filePath}. Ingested before source hashing existed — re-ingest to make this verifiable.`,
      });
      continue;
    }

    const fullPath = path.join(workspaceRoot, filePath);

    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      drifted.push({
        file: filePath,
        type: 'deleted_file',
        message: `Indexed module has no source file on disk: ${filePath}`,
        expected: module.source_hash,
      });
      continue;
    }

    checked++;
    const actual = hashSource(content);

    if (actual !== module.source_hash) {
      staleCount++;
      drifted.push({
        file: filePath,
        type: 'stale_index',
        expected: module.source_hash,
        found: actual,
        message: `Source file changed since ingest: ${filePath}`,
      });
    }
  }

  return {
    available: true,
    totalIndexed: modules.length,
    checked,
    staleCount,
    unknownCount,
  };
}

/**
 * Vergleicht gegen einen git-Referenzpunkt.
 *
 * Der frühere Filter `filePath.startsWith('src/')` verwarf in einem Monorepo
 * jede Datei, weil die Pfade dort `<paket>/src/…` lauten — das Ergebnis war
 * immer eine leere Liste und damit ein falsches „clean".
 */
async function checkGitChanges(
  since: string,
  workspaceRoot: string,
  drifted: DriftItem[]
): Promise<DriftGitReport> {
  let gitDiff: string;
  try {
    const result = await execAsync(`git diff --name-status ${since}`, { cwd: workspaceRoot });
    gitDiff = result.stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      since,
      changedFiles: [],
      reason: `git diff failed: ${message}`,
    };
  }

  const changedFiles: string[] = [];
  const lines = gitDiff.split('\n').filter(Boolean);

  for (const line of lines) {
    const [status, filePath] = line.split('\t');

    // Quelldateien in einem beliebig tief geschachtelten src/-Verzeichnis.
    if (!filePath || !/(^|\/)src\//.test(filePath) || !SOURCE_FILE_REGEX.test(filePath)) {
      continue;
    }

    changedFiles.push(filePath);

    switch (status) {
      case 'A':
        drifted.push({
          file: filePath,
          type: 'new_file',
          message: `New file added: ${filePath}`,
        });
        break;

      case 'D':
        drifted.push({
          file: filePath,
          type: 'deleted_file',
          message: `File deleted: ${filePath}`,
        });
        break;

      case 'M': {
        const docPath = getDocPath(filePath, workspaceRoot);
        if (fsSync.existsSync(docPath)) {
          drifted.push({
            file: filePath,
            type: 'modified',
            message: `File modified, documentation may be outdated: ${filePath}`,
          });
        } else {
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

  return { available: true, since, changedFiles };
}

/**
 * Prüft auf Drift zwischen Code, Dokumentation und indiziertem Wissensstand.
 * @public
 */
export async function runDriftCheck(request: DriftRequest): Promise<DriftResponse> {
  const startTime = Date.now();
  const since = request.since || 'HEAD~1';
  const workspaceRoot = request.workspaceRoot;
  const drifted: DriftItem[] = [];

  const index = await checkIndexFreshness(request.modules, workspaceRoot, drifted);
  const git = await checkGitChanges(since, workspaceRoot, drifted);

  // Reihenfolge der Bewertung: echte Funde schlagen Unwissen, Unwissen schlägt
  // Entwarnung. `clean` wird nur vergeben, wenn die Index-Prüfung tatsächlich
  // gelaufen ist und nichts gefunden hat.
  //
  // `status` beantwortet die primäre Frage -- ist der Index aktuell? -- und
  // hängt deshalb nur an der Index-Prüfung. Eine nicht verfügbare git-Prüfung
  // (kein Repository, kein gültiger Referenzpunkt) macht das Ergebnis nicht
  // ungewiss; sie wird in `git.reason` ausgewiesen und der Aufrufer kann
  // `git.available` auswerten.
  const hasRealDrift = drifted.some(item => item.type !== 'unknown_index');
  let status: DriftResponse['status'];
  if (hasRealDrift) {
    status = 'drift_detected';
  } else if (!index.available || index.unknownCount > 0) {
    status = 'unknown';
  } else {
    status = 'clean';
  }

  const changedFiles = Array.from(
    new Set([...git.changedFiles, ...drifted.filter(d => d.type === 'stale_index').map(d => d.file)])
  );

  return {
    status,
    drifted,
    changedFiles,
    index,
    git,
    duration: Date.now() - startTime,
  };
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
