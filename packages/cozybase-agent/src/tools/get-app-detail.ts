import { Type } from '@sinclair/typebox';
import type { CozyBaseActionDefinition } from '../actions';

const schema = Type.Object({
  app_name: Type.String({ minLength: 1 }),
});

export const getAppDetailAction: CozyBaseActionDefinition<typeof schema> = {
  name: 'get_app_detail',
  description: 'Get status, versions, pages, and functions for a specific app.',
  schema,
  execute: async (context, input) => context.getAppDetail(input.app_name),
};
