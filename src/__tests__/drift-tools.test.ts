import { runDriftCheck } from '../tools/drift-tools.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Regressionstests fuer validation_runDriftCheck.
 *
 * Hintergrund: Der Drift-Check meldete `status: "clean"`, waehrend 40
 * Quelldateien seit dem letzten Ingest geaendert waren. Zwei Ursachen:
 *
 *  1. Der Pfadfilter `filePath.startsWith('src/')` verwarf in einem Monorepo
 *     jede Datei, weil die Pfade dort `<paket>/src/...` lauten.
 *  2. Die Baseline war ein git-Ref und konnte prinzipiell nicht beantworten,
 *     ob die Datenbank veraltet ist.
 *
 * Die Tests bilden genau den Fall ab, an dem der Fehler auffiel: eine Datei,
 * die sich seit dem Ingest geaendert hat.
 */
describe('runDriftCheck', () => {
    let workspaceRoot: string;

    const SOURCE_REL = 'pkg-a/src/core/consolidation.ts';
    const ORIGINAL = 'export function a() { return 1; }\n';
    const CHANGED = 'export function a() { return 2; }\n';

    const hash = (content: string) => crypto.createHash('sha256').update(content).digest('hex');

    const writeSource = (content: string) => {
        const full = path.join(workspaceRoot, SOURCE_REL);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf-8');
    };

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-test-'));
        writeSource(ORIGINAL);
    });

    afterEach(() => {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    test('reports clean when every indexed module still matches its source file', async () => {
        const result = await runDriftCheck({
            workspaceRoot,
            modules: [{ file_path: SOURCE_REL, source_hash: hash(ORIGINAL) }]
        });

        expect(result.status).toBe('clean');
        expect(result.index.staleCount).toBe(0);
        expect(result.index.checked).toBe(1);
        expect(result.drifted).toHaveLength(0);
    });

    test('detects a source file that changed after ingest', async () => {
        // Indexstand entspricht dem alten Inhalt, auf der Platte steht der neue.
        const indexedHash = hash(ORIGINAL);
        writeSource(CHANGED);

        const result = await runDriftCheck({
            workspaceRoot,
            modules: [{ file_path: SOURCE_REL, source_hash: indexedHash }]
        });

        expect(result.status).toBe('drift_detected');
        expect(result.index.staleCount).toBe(1);

        const item = result.drifted.find(d => d.type === 'stale_index');
        expect(item).toBeDefined();
        expect(item!.file).toBe(SOURCE_REL);
        expect(item!.expected).toBe(indexedHash);
        expect(item!.found).toBe(hash(CHANGED));

        // Der Monorepo-Pfad darf nicht mehr weggefiltert werden.
        expect(result.changedFiles).toContain(SOURCE_REL);
    });

    test('never reports clean when no index snapshot was supplied', async () => {
        const result = await runDriftCheck({ workspaceRoot });

        expect(result.status).not.toBe('clean');
        expect(result.index.available).toBe(false);
        expect(result.index.reason).toBeTruthy();
    });

    test('never reports clean when the index is empty', async () => {
        const result = await runDriftCheck({ workspaceRoot, modules: [] });

        expect(result.status).not.toBe('clean');
        expect(result.index.available).toBe(false);
    });

    test('treats a missing source_hash as unknown, not as unchanged', async () => {
        const result = await runDriftCheck({
            workspaceRoot,
            modules: [{ file_path: SOURCE_REL, source_hash: null }]
        });

        expect(result.status).toBe('unknown');
        expect(result.index.unknownCount).toBe(1);
        expect(result.drifted[0].type).toBe('unknown_index');
    });

    test('flags an indexed module whose source file has disappeared', async () => {
        fs.rmSync(path.join(workspaceRoot, SOURCE_REL));

        const result = await runDriftCheck({
            workspaceRoot,
            modules: [{ file_path: SOURCE_REL, source_hash: hash(ORIGINAL) }]
        });

        expect(result.status).toBe('drift_detected');
        expect(result.drifted.some(d => d.type === 'deleted_file')).toBe(true);
    });
});
