/**
 * MCP Tool Type Definitions for CozyBase
 *
 * These types define the input/output interfaces for MCP tools
 * that allow AI Agents to manage CozyBase APPs via the MCP protocol.
 *
 * The actual MCP Server implementation is in a separate change.
 * Tools map to Management API endpoints.
 */

import type { AppState } from '../../core/workspace';

// --- Shared Types ---

export interface McpAppFile {
  path: string;
  content: string;
  immutable: boolean;
}

export interface McpAppInfo {
  name: string;
  description: string;
  current_version: number;
  published_version: number;
  state: AppState | 'unknown';
}

export interface McpAppWithFiles extends McpAppInfo {
  files: McpAppFile[];
}

// --- create_app ---

export interface CreateAppInput {
  name: string;
  description?: string;
}

export interface CreateAppOutput extends McpAppWithFiles {
  api_key: string;
}

// --- list_apps ---

// No input needed
export interface ListAppsOutput {
  apps: McpAppInfo[];
}

// --- fetch_app ---

export interface FetchAppInput {
  app_name: string;
}

export type FetchAppOutput = McpAppWithFiles;

// --- update_app ---

export interface UpdateAppInput {
  app_name: string;
  base_version: number;
  files: { path: string; content: string }[];
}

export type UpdateAppOutput = McpAppWithFiles;

// --- update_app_file ---

export interface UpdateAppFileInput {
  app_name: string;
  path: string;
  content: string;
}

export interface UpdateAppFileOutput {
  path: string;
  content: string;
  immutable: boolean;
}

// --- delete_app ---

export interface DeleteAppInput {
  app_name: string;
}

export interface DeleteAppOutput {
  message: string;
}

// --- MCP Tool Registry Type ---

export interface McpToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

export type McpToolRegistry = {
  create_app: McpToolDefinition<CreateAppInput, CreateAppOutput>;
  list_apps: McpToolDefinition<Record<string, never>, ListAppsOutput>;
  fetch_app: McpToolDefinition<FetchAppInput, FetchAppOutput>;
  update_app: McpToolDefinition<UpdateAppInput, UpdateAppOutput>;
  update_app_file: McpToolDefinition<UpdateAppFileInput, UpdateAppFileOutput>;
  delete_app: McpToolDefinition<DeleteAppInput, DeleteAppOutput>;
};
