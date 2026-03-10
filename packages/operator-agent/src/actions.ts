import type { Static, TSchema } from '@sinclair/typebox';
import type { CallApiFn } from './types';

export interface OperatorActionContext {
  callApi: CallApiFn;
}

export interface OperatorActionDefinition<TSchemaType extends TSchema = TSchema> {
  name: string;
  description: string;
  schema: TSchemaType;
  execute(
    context: OperatorActionContext,
    input: Static<TSchemaType>,
  ): Promise<unknown>;
}

export interface BoundOperatorAction<TSchemaType extends TSchema = TSchema> {
  name: string;
  description: string;
  schema: TSchemaType;
  execute(input: Static<TSchemaType>): Promise<unknown>;
}

export function bindOperatorAction<TSchemaType extends TSchema>(
  action: OperatorActionDefinition<TSchemaType>,
  context: OperatorActionContext,
): BoundOperatorAction<TSchemaType> {
  return {
    name: action.name,
    description: action.description,
    schema: action.schema,
    execute: async (input) => {
      try {
        return await action.execute(context, input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith(`${action.name} failed:`)) {
          throw error;
        }
        throw new Error(`${action.name} failed: ${message}`);
      }
    },
  };
}
