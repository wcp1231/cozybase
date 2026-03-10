import { Type } from '@sinclair/typebox';
import type { CozyBaseActionDefinition } from '../actions';

const schema = Type.Object({
  app_name: Type.String({ minLength: 1 }),
  instruction: Type.String({ minLength: 1 }),
});

export const developAppAction: CozyBaseActionDefinition<typeof schema> = {
  name: 'develop_app',
  description: 'Delegate app development work to the Builder agent asynchronously.',
  schema,
  execute: async (context, input) => context.developApp(input.app_name, input.instruction),
};
