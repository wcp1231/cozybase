import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYAML } from 'yaml';
import { z } from 'zod';

// --- YAML Schema Definitions ---

const ColumnSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  type: z.enum(['text', 'integer', 'real', 'blob', 'numeric']),
  primary_key: z.boolean().optional(),
  required: z.boolean().optional(),   // maps to NOT NULL
  unique: z.boolean().optional(),
  default: z.string().optional(),
  references: z.string().optional(),   // e.g. "users(id)"
});

const IndexSchema = z.object({
  columns: z.array(z.string()).min(1),
  unique: z.boolean().optional(),
  name: z.string().optional(),
});

const TableSpecSchema = z.object({
  columns: z.array(ColumnSchema).min(1),
  indexes: z.array(IndexSchema).optional(),
});

const AppSpecSchema = z.object({
  description: z.string().optional(),
}).passthrough();

export type ColumnSpec = z.infer<typeof ColumnSchema>;
export type IndexSpec = z.infer<typeof IndexSchema>;
export type TableSpec = z.infer<typeof TableSpecSchema>;
export type AppSpec = z.infer<typeof AppSpecSchema>;

// --- App Discovery Result ---

export interface AppDefinition {
  name: string;
  dir: string;
  spec: AppSpec;
  tables: Map<string, { spec: TableSpec; content: string }>;
  functions: string[];    // function names (file stems)
}

// --- Workspace Scanner ---

const APP_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Scan workspace directory and discover all apps */
export function scanWorkspace(workspaceDir: string): AppDefinition[] {
  if (!existsSync(workspaceDir)) {
    throw new Error(`Workspace directory does not exist: ${workspaceDir}`);
  }

  const entries = readdirSync(workspaceDir, { withFileTypes: true });
  const apps: AppDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!APP_NAME_PATTERN.test(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const appDir = join(workspaceDir, entry.name);
    const appYamlPath = join(appDir, 'app.yaml');

    if (!existsSync(appYamlPath)) continue;

    const app = loadAppDefinition(entry.name, appDir);
    if (app) apps.push(app);
  }

  return apps;
}

/** Load a single app's full definition from its directory */
export function loadAppDefinition(name: string, dir: string): AppDefinition | null {
  const appYamlPath = join(dir, 'app.yaml');

  // Parse app.yaml (can be empty)
  let spec: AppSpec = {};
  try {
    const content = readFileSync(appYamlPath, 'utf-8').trim();
    if (content) {
      const parsed = parseYAML(content);
      spec = AppSpecSchema.parse(parsed ?? {});
    }
  } catch (err: any) {
    console.error(`[${name}] Failed to parse app.yaml: ${err.message}`);
    return null;
  }

  // Load tables
  const tables = new Map<string, { spec: TableSpec; content: string }>();
  const tablesDir = join(dir, 'tables');
  if (existsSync(tablesDir)) {
    const files = readdirSync(tablesDir).filter((f) => f.endsWith('.yaml'));
    for (const file of files) {
      const tableName = basename(file, '.yaml');
      try {
        const content = readFileSync(join(tablesDir, file), 'utf-8');
        const parsed = parseYAML(content);
        const tableSpec = TableSpecSchema.parse(parsed);
        tables.set(tableName, { spec: tableSpec, content });
      } catch (err: any) {
        console.error(`[${name}] Failed to parse tables/${file}: ${err.message}`);
      }
    }
  }

  // Discover functions
  const functions: string[] = [];
  const functionsDir = join(dir, 'functions');
  if (existsSync(functionsDir)) {
    const files = readdirSync(functionsDir).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      functions.push(basename(file, '.ts'));
    }
  }

  return { name, dir, spec, tables, functions };
}

/** Compute SHA256 hash of a string */
export function hashContent(content: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(content);
  return hasher.digest('hex');
}
