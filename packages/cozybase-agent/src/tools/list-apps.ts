import { Type } from '@sinclair/typebox';
import type { CozyBaseActionDefinition } from '../actions';

export const listAppsAction: CozyBaseActionDefinition = {
  name: 'list_apps',
  description: 'List all CozyBase apps with summary fields only.',
  schema: Type.Object({}),
  execute: async (context) => context.listApps(),
};
