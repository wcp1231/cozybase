import { CronPattern } from 'croner';
import { parse as parseYAML } from 'yaml';
import { z } from 'zod';
import type { PlatformRepository } from './platform-repository';

export type ScheduleConcurrency = 'skip' | 'queue' | 'parallel';

export interface FunctionReference {
  fileName: string;
  exportName: string;
  raw: string;
}

export interface AppSchedule {
  name: string;
  cron: string;
  functionRef: FunctionReference;
  enabled: boolean;
  concurrency: ScheduleConcurrency;
  timezone: string;
  timeout: number;
}

export interface ParseSchedulesResult {
  schedules: AppSchedule[];
  warnings: string[];
}

const FILE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const EXPORT_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_TIMEOUT_MS = 30_000;

const ScheduleSchema = z.object({
  name: z.string().trim().min(1),
  cron: z.string().trim().min(1),
  function: z.string().trim().min(1),
  enabled: z.boolean().optional().default(true),
  concurrency: z.enum(['skip', 'queue', 'parallel']).optional().default('skip'),
  timezone: z.string().trim().min(1).optional().default(DEFAULT_TIMEZONE),
  timeout: z.number().int().positive().optional().default(DEFAULT_TIMEOUT_MS),
});

export function loadSchedulesFromAppConfig(
  platformRepo: PlatformRepository,
  appSlug: string,
): ParseSchedulesResult {
  const appYaml = platformRepo.appFiles.findByAppAndPath(appSlug, 'app.yaml');
  if (!appYaml) {
    return {
      schedules: [],
      warnings: [`App '${appSlug}' is missing app.yaml; no schedules loaded.`],
    };
  }
  return parseSchedulesFromAppYaml(appYaml.content);
}

export function parseSchedulesFromAppYaml(content: string): ParseSchedulesResult {
  const warnings: string[] = [];

  let parsedYaml: unknown;
  try {
    parsedYaml = parseYAML(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      schedules: [],
      warnings: [`Failed to parse app.yaml: ${message}`],
    };
  }

  if (!isRecord(parsedYaml)) {
    return { schedules: [], warnings };
  }

  const rawSchedules = parsedYaml.schedules;
  if (rawSchedules === undefined) {
    return { schedules: [], warnings };
  }
  if (!Array.isArray(rawSchedules)) {
    return {
      schedules: [],
      warnings: ['Invalid schedules config: "schedules" must be an array.'],
    };
  }

  const seenNames = new Set<string>();
  const schedules: AppSchedule[] = [];

  for (let i = 0; i < rawSchedules.length; i += 1) {
    const raw = rawSchedules[i];
    const at = `schedules[${i}]`;

    const parsed = ScheduleSchema.safeParse(raw);
    if (!parsed.success) {
      warnings.push(`Skipping ${at}: ${parsed.error.issues[0]?.message ?? 'invalid schedule config'}.`);
      continue;
    }

    const item = parsed.data;
    if (seenNames.has(item.name)) {
      warnings.push(`Skipping ${at}: duplicated schedule name '${item.name}'.`);
      continue;
    }

    const functionRef = parseFunctionReference(item.function);
    if (!functionRef.ok) {
      warnings.push(`Skipping ${at}: ${functionRef.error}`);
      continue;
    }

    if (!isValidCronExpression(item.cron, item.timezone)) {
      warnings.push(`Skipping ${at}: invalid cron expression '${item.cron}'.`);
      continue;
    }

    seenNames.add(item.name);
    schedules.push({
      name: item.name,
      cron: item.cron,
      functionRef: functionRef.value,
      enabled: item.enabled,
      concurrency: item.concurrency,
      timezone: item.timezone,
      timeout: item.timeout,
    });
  }

  return { schedules, warnings };
}

export function parseFunctionReference(
  rawReference: string,
): { ok: true; value: FunctionReference } | { ok: false; error: string } {
  const trimmed = rawReference.trim();
  if (!trimmed) {
    return { ok: false, error: 'function reference cannot be empty' };
  }

  const parts = trimmed.split(':');
  if (parts.length > 2) {
    return {
      ok: false,
      error: `function reference '${rawReference}' must be '<file>' or '<file>:<exportName>'`,
    };
  }

  const fileName = parts[0]!;
  const exportName = parts[1] || 'default';

  if (!FILE_NAME_PATTERN.test(fileName)) {
    return {
      ok: false,
      error: `invalid function file name '${fileName}'`,
    };
  }
  if (!EXPORT_NAME_PATTERN.test(exportName)) {
    return {
      ok: false,
      error: `invalid function export name '${exportName}'`,
    };
  }

  return {
    ok: true,
    value: {
      fileName,
      exportName,
      raw: trimmed,
    },
  };
}

function isValidCronExpression(cron: string, timezone: string): boolean {
  try {
    new CronPattern(cron, timezone);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
