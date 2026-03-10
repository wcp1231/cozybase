import { Type } from '@sinclair/typebox';
import type { CozyBaseActionDefinition } from '../actions';

const schema = Type.Object({
  app_name: Type.String({ minLength: 1 }),
});

export const startAppAction: CozyBaseActionDefinition<typeof schema> = {
  name: 'start_app',
  description: 'Start the stable runtime for a published app.',
  schema,
  execute: async (context, input) => context.startApp(input.app_name),
};
