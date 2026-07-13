# MCP Server Tools Documentation

Complete reference for all available tools in the Noyrax Unified MCP Server.

## Database Tools (5D Database Plugin)

### query_modules

Query modules by file path.

**Parameters:**
- `filePath` (string, required): Path to the module file
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Module documentation including functions, classes, interfaces, exports

**Example:**
```json
{
  "name": "query_modules",
  "arguments": {
    "filePath": "src/api/user-service.ts",
    "pluginId": "workspace"
  }
}
```

**Use Case:** Get complete documentation for a specific file/module.

---

### query_symbols

Query symbols by path or symbol ID.

**Parameters:**
- `path` (string, optional): File path to get symbols from
- `symbolId` (string, optional): Specific symbol ID
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Symbol information (functions, classes, interfaces, types)

**Example:**
```json
{
  "name": "query_symbols",
  "arguments": {
    "path": "src/api/user-service.ts",
    "pluginId": "workspace"
  }
}
```

**Use Case:** Find specific functions, classes, or types in a file.

---

### query_dependencies

Query dependencies between modules.

**Parameters:**
- `fromModule` (string, optional): Source module path (outgoing dependencies)
- `toModule` (string, optional): Target module path (incoming dependencies)
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Dependency list with relationships

**Example:**
```json
{
  "name": "query_dependencies",
  "arguments": {
    "fromModule": "src/api/user-service.ts",
    "pluginId": "workspace"
  }
}
```

**Use Case:** Understand what a module depends on or what depends on it.

---

### query_adrs

Query Architecture Decision Records (ADRs) by number or path.

**Parameters:**
- `adrNumberOrPath` (string, required): ADR number (e.g., `"040"`, `"ADR-040"`, `"001"`, `"ADR-001"`) **oder** Repository-relativer **Modul-Dateipfad** (z.B. `"src/extension.ts"`) um ADRs zu diesem File zu laden
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Bei ADR-Nummer: ein einzelnes ADR (oder `null`)
- Bei Modul-Dateipfad: Liste von ADRs (kann leer sein)

**Note:** Das "ADR-" Präfix wird automatisch normalisiert (case-insensitive). Sowohl `"040"` als auch `"ADR-040"` funktionieren.

**Example:**
```json
{
  "name": "query_adrs",
  "arguments": {
    "adrNumberOrPath": "040",
    "pluginId": "workspace"
  }
}
```

**Example (with "ADR-" prefix):**
```json
{
  "name": "query_adrs",
  "arguments": {
    "adrNumberOrPath": "ADR-040",
    "pluginId": "workspace"
  }
}
```

**Example (ADRs for a module file path):**
```json
{
  "name": "query_adrs",
  "arguments": {
    "adrNumberOrPath": "src/extension.ts",
    "pluginId": "workspace"
  }
}
```

**Use Case:** Understand why architectural decisions were made.

---

### query_changes

Query change reports (T-Dimension).

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Latest change report with added, modified, removed symbols

**Example:**
```json
{
  "name": "query_changes",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Track recent changes to the codebase.

---

### cross_analysis

Perform cross-dimension analysis for a file.

**Parameters:**
- `filePath` (string, required): Path to the file
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Combined information: ADRs, symbols, dependencies for the file

**Example:**
```json
{
  "name": "cross_analysis",
  "arguments": {
    "filePath": "src/api/user-service.ts",
    "pluginId": "workspace"
  }
}
```

**Use Case:** Get complete context for a file (all dimensions combined).

---

### semantic_discovery

Semantic search and context retrieval using Semantic Brain (V-Dimension).

**Parameters:**
- `query` (string, required): Natural language query
- `pluginId` (string, required): Plugin/workspace identifier
- `limit` (number, optional, default: 10): Maximum number of results

**Returns:**
- Relevant modules, symbols, ADRs based on semantic similarity

**Example:**
```json
{
  "name": "semantic_discovery",
  "arguments": {
    "query": "How does user authentication work?",
    "pluginId": "workspace",
    "limit": 5
  }
}
```

**Use Case:** Find code by meaning, not exact names.

---

### system_explanation

Get system overview, entry points, and architecture ADRs.

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- System overview, entry points, architecture ADRs, system structure

**Example:**
```json
{
  "name": "system_explanation",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** First-time system understanding, get started with a codebase.

---

### learning_path

Generate guided learning path for understanding a topic.

**Parameters:**
- `topic` (string, required): Topic to learn (e.g., "authentication", "database layer")
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Step-by-step learning path with modules, ADRs, dependencies

**Example:**
```json
{
  "name": "learning_path",
  "arguments": {
    "topic": "authentication",
    "pluginId": "workspace"
  }
}
```

**Use Case:** Learn a specific topic step-by-step.

---

### bootstrap

Get bootstrap information for first-time system understanding.

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Bootstrap information: system overview, key concepts, entry points

**Example:**
```json
{
  "name": "bootstrap",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Initial system understanding for AI agents without prior knowledge.

---

### gap_analysis

Find documentation gaps by analyzing modules with many dependencies but few/no ADRs.

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier
- `minDependencies` (number, optional, default: 5): Minimum dependencies to consider
- `limit` (number, optional, default: 50): Maximum number of results

**Returns:**
- Prioritized list of modules needing documentation (Gap Score)

**Example:**
```json
{
  "name": "gap_analysis",
  "arguments": {
    "pluginId": "workspace",
    "minDependencies": 5,
    "limit": 20
  }
}
```

**Use Case:** Identify modules that need documentation (ADRs).

---

### architecture_mining

Mine architectural decisions from code structure.

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier
- `filePath` (string, optional): Specific file to analyze (if not provided, analyzes entire system)

**Returns:**
- Discovered architectural patterns (Repository, API Layer, Builder, Factory, etc.)

**Example:**
```json
{
  "name": "architecture_mining",
  "arguments": {
    "pluginId": "workspace",
    "filePath": "src/api/user-service.ts"
  }
}
```

**Use Case:** Discover architecture patterns from code structure.

---

### generate_documentation

Generate documentation using Noyrax (Documentation System Plugin).

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Status of documentation generation

**Example:**
```json
{
  "name": "generate_documentation",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Generate or update documentation (creates `docs/` directory).

---

### check_docs_status

Check if `docs/` directory exists and is up-to-date.

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Status of `docs/` directory (exists, up-to-date, missing files)

**Example:**
```json
{
  "name": "check_docs_status",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Verify documentation exists before using Database Tools.

---

## Validation Tools (Documentation System Plugin)

### validation/runScan

Run documentation scan (scans codebase for changes).

**Parameters:**
- `files` (array of strings, optional): Specific files to scan (if not provided, scans all)
- `incremental` (boolean, optional, default: true): Only scan changed files

**Returns:**
- Scan results with found modules, symbols, changes

**Example:**
```json
{
  "name": "validation/runScan",
  "arguments": {
    "files": ["src/api/user-service.ts"],
    "incremental": true
  }
}
```

**Use Case:** Scan codebase for documentation updates.

---

### validation/runValidate

Run documentation validation (checks consistency).

**Parameters:**
- `files` (array of strings, optional): Specific files to validate
- `verbose` (boolean, optional, default: false): Detailed output

**Returns:**
- Validation results (errors, warnings, status)

**Example:**
```json
{
  "name": "validation/runValidate",
  "arguments": {
    "files": ["src/api/user-service.ts"],
    "verbose": true
  }
}
```

**Use Case:** Validate documentation consistency (signatures, exports, etc.).

---

### validation/runDriftCheck

Check for drift between code and documentation.

**Parameters:**
- `since` (string, optional): Git commit/tag to check since

**Returns:**
- Drift report (mismatches between code and docs)

**Example:**
```json
{
  "name": "validation/runDriftCheck",
  "arguments": {
    "since": "main"
  }
}
```

**Use Case:** Detect when documentation is out of sync with code.

---

### validation/analyzeImpact

Analyze impact of changes to a file or symbol.

**Parameters:**
- `file` (string, required): File path
- `symbol` (string, optional): Specific symbol name

**Returns:**
- Impact analysis (what depends on this file/symbol)

**Example:**
```json
{
  "name": "validation/analyzeImpact",
  "arguments": {
    "file": "src/api/user-service.ts",
    "symbol": "UserService"
  }
}
```

**Use Case:** Understand what will break if a file/symbol changes.

---

### validation/verifyAdrs

Verify ADR claims against code.

**Parameters:**
- `verbose` (boolean, optional, default: false): Detailed output

**Returns:**
- Verification results (which ADR claims are valid/invalid)

**Example:**
```json
{
  "name": "validation/verifyAdrs",
  "arguments": {
    "verbose": true
  }
}
```

**Use Case:** Verify that ADR claims match actual code.

---

## Orchestration Tools

### workflow/full_cycle

Full workflow: Scan → Generate → Validate → Ingest → Embeddings.

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Status of each workflow step

**Example:**
```json
{
  "name": "workflow/full_cycle",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Complete documentation cycle (everything in one command).

---

### workflow/generate_and_ingest

Generate documentation and ingest into database.

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- Status of generation and ingestion

**Example:**
```json
{
  "name": "workflow/generate_and_ingest",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Update documentation and databases (without embeddings).

---

### workflow/check_status

Check system status (docs/, databases, embeddings).

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- System status: docs/ exists, databases exist, embeddings exist

**Example:**
```json
{
  "name": "workflow/check_status",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Diagnose system health, verify installation.

---

### workflow/ensure_ready

Best-effort: ensure the system is ready for onboarding and usage.

This tool:
- runs `workflow/check_status`
- if docs/ or databases are missing/incomplete, it attempts the minimal required steps:
  - generate docs/ (requires `documentation-system-plugin` compiled)
  - ingest databases (requires `5d-database-plugin` compiled)
- returns `ready: true/false` plus actionable next steps

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier

**Returns:**
- `ready` (boolean) and a structured result (steps, blocking issues, next steps)

**Example:**
```json
{
  "name": "workflow/ensure_ready",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** One-call setup helper for foreign codebases (reduce setup friction).

---

### workflow/boundary_report

Get system boundary report: workspace root detection, plugin roots, exclude directories, path normalization rules, and boundary validation.

This tool helps identify workspace boundaries for foreign codebases by:
- Detecting workspace root (normalized, canonical form)
- Finding plugin roots (multiple plugins in Monorepo)
- Detecting exclude directories (node_modules, dist, .git, etc.)
- Providing path normalization rules (forward-slashes, case-sensitive detection)
- Reading ignore rules (.gitignore, .cursorignore)
- Validating boundary (checks if pluginId matches workspace root)

**Parameters:**
- `pluginId` (string, optional): Plugin ID for validation
- `workspaceRoot` (string, optional): Override workspace root

**Returns:**
- `workspace_root`: Normalized, canonical form
- `detected_plugin_roots`: Multiple plugins in Monorepo
- `exclude_dirs`: node_modules, dist, etc.
- `path_normalization`: Separator, case-sensitive, canonical form
- `ignore_rules`: .gitignore and .cursorignore rules
- `boundary_validation`: Plugin ID match, issues
- `evidence`: FACT evidence from filesystem reads

**Example:**
```json
{
  "name": "workflow_boundary_report",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Identify workspace boundaries for foreign codebases, validate workspace root, detect Monorepo structure.

---

### workflow/onboard

Onboard a foreign codebase and return a deterministic onboarding report.

This tool:
- optionally runs `workflow/ensure_ready` (default: true)
- collects deterministic system facts via existing tools/APIs:
  - `system_explanation` (system map: entry points, ADRs, dimension stats)
  - `query_changes` (latest change run metadata)
  - `gap_analysis` (documentation/complexity hotspots)
  - optional `semantic_discovery` queries (bounded)
- returns:
  - `reportMarkdown` (copy/paste friendly)
  - `reportJson` (structured data for AI agents)
  - `recommendedNextQueries` (usually `cross_analysis` candidates)

**Parameters:**
- `pluginId` (string, required): Plugin/workspace identifier
- `ensureReady` (boolean, optional, default: true): Whether to run readiness fixing first
- `semanticQueries` (string[], optional): Custom semantic discovery queries (bounded)
- `semanticLimit` (number, optional, default: 5): Limit per semantic query
- `gapMinDependencies` (number, optional, default: 5): Minimum deps threshold for gap_analysis
- `gapLimit` (number, optional, default: 20): Max gap results

**Example:**
```json
{
  "name": "workflow/onboard",
  "arguments": {
    "pluginId": "workspace"
  }
}
```

**Use Case:** Visible value in 15–30 minutes: system map + hotspots + next steps (ideal for dev + AI).

---

## Tool Categories Summary

| Category | Tools | Purpose |
|----------|-------|---------|
| **Database Tools** | 14 tools | Query 5D database, semantic search, system analysis |
| **Validation Tools** | 5 tools | Documentation validation, drift detection, impact analysis |
| **Orchestration Tools** | 5 tools | Workflow coordination, system status, onboarding |

**Total: 24 tools**

## Common Patterns

### Pattern 0: Onboarding a foreign codebase (fast visible value)

```typescript
// One-call onboarding report (recommended)
workflow/onboard({ pluginId: "workspace" })
```

### Pattern 1: First-Time System Understanding

```typescript
// 1. Bootstrap
bootstrap({ pluginId: "workspace" })

// 2. System explanation
system_explanation({ pluginId: "workspace" })

// 3. Find entry points
semantic_discovery({ 
  query: "main entry point", 
  pluginId: "workspace" 
})
```

### Pattern 2: Understanding a Module

```typescript
// 1. Get module
query_modules({ filePath: "src/api/user-service.ts", pluginId: "workspace" })

// 2. Get context
cross_analysis({ filePath: "src/api/user-service.ts", pluginId: "workspace" })

// 3. Get dependencies
query_dependencies({ fromModule: "src/api/user-service.ts", pluginId: "workspace" })
```

### Pattern 3: Finding Code by Meaning

```typescript
// Semantic search
semantic_discovery({ 
  query: "How does user authentication work?", 
  pluginId: "workspace",
  limit: 10
})
```

### Pattern 4: Documentation Workflow

```typescript
// 1. Check status
workflow/check_status({ pluginId: "workspace" })

// 2. Generate if needed
generate_documentation({ pluginId: "workspace" })

// 3. Validate
validation/runValidate({ pluginId: "workspace" })
```

## Error Handling

All tools return structured JSON responses. Errors are returned as:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

Common error codes:
- `PLUGIN_NOT_AVAILABLE`: Plugin not found or not compiled
- `DOCS_NOT_FOUND`: `docs/` directory missing
- `DATABASE_NOT_FOUND`: SQLite databases missing
- `INVALID_PARAMETERS`: Missing or invalid parameters

---

### explain_tools

**NEW:** Get comprehensive guide to all available tools with explanations, workflow patterns, examples, and recommendations.

**Parameters:**
- `category` (string, optional): Filter tools by category (`database`, `validation`, `orchestration`, `all`)
- `toolName` (string, optional): Get detailed information for a specific tool
- `useCase` (string, optional): Get tool recommendations for a use case (e.g., `"understand module"`, `"find code"`, `"validate docs"`)

**Returns:**
- Summary with total tools and category counts
- Tools organized by category with detailed information (use cases, parameters, examples, related tools)
- Workflow patterns showing how to combine tools
- Tool recommendations for specified use case (if provided)

**Example:**
```json
{
  "name": "explain_tools"
}
```

**Example (with category filter):**
```json
{
  "name": "explain_tools",
  "arguments": {
    "category": "database"
  }
}
```

**Example (with use case):**
```json
{
  "name": "explain_tools",
  "arguments": {
    "useCase": "understand module"
  }
}
```

**Use Case:** Help AI agents understand which tools to use and how to combine them effectively.

---

## See Also

- [INSTALLATION_FOR_AI_AGENTS.md](../INSTALLATION_FOR_AI_AGENTS.md) - Installation guide
- [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) - Detailed setup
- [README.md](README.md) - General information

