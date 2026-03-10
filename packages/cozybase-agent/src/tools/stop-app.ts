import { Type } from '@sinclair/typebox';
import type { CozyBaseActionDefinition } from '../actions';

const schema = Type.Object({
  app_name: Type.String({ minLength: 1 }),
});

export const stopAppAction: CozyBaseActionDefinition<typeof schema> = {
  name: 'stop_app',
  description: 'Stop the stable runtime for a running app.',
  schema,
  execute: async (context, input) => context.stopApp(input.app_name),
};
