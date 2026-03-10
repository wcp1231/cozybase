import { Type } from '@sinclair/typebox';
import type { CozyBaseActionDefinition } from '../actions';

const schema = Type.Object({
  idea: Type.String({ minLength: 1 }),
});

export const createAppAction: CozyBaseActionDefinition<typeof schema> = {
  name: 'create_app',
  description: 'Create a new app and delegate the build task asynchronously.',
  schema,
  execute: async (context, input) => context.createApp(input.idea),
};
