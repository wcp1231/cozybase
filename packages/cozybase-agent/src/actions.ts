import type { Static, TSchema } from '@sinclair/typebox';
import type { CozyBaseActionContext } from './types';

export interface CozyBaseActionDefinition<TSchemaType extends TSchema = TSchema> {
  name: string;
  description: string;
  schema: TSchemaType;
  execute(
    context: CozyBaseActionContext,
    input: Static<TSchemaType>,
  ): Promise<unknown>;
}
