import { Type } from '@sinclair/typebox';
import type { CozyBaseActionDefinition } from '../actions';

const schema = Type.Object({
  app_name: Type.String({ minLength: 1 }),
  instruction: Type.String({ minLength: 1 }),
});

export const operateAppAction: CozyBaseActionDefinition<typeof schema> = {
  name: 'operate_app',
  description: 'Delegate data operations to the Operator agent asynchronously.',
  schema,
  execute: async (context, input) => context.operateApp(input.app_name, input.instruction),
};
