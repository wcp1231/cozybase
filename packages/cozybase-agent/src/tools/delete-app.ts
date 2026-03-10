import { Type } from '@sinclair/typebox';
import type { CozyBaseActionDefinition } from '../actions';

const schema = Type.Object({
  app_name: Type.String({ minLength: 1 }),
});

export const deleteAppAction: CozyBaseActionDefinition<typeof schema> = {
  name: 'delete_app',
  description: 'Delete an app and clean up its related sessions.',
  schema,
  execute: async (context, input) => context.deleteApp(input.app_name),
};
