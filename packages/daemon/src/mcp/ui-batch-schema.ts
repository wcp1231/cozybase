import { z } from 'zod';

export const batchRefSchema = z
  .string()
  .regex(/^\$.+/, 'ref must start with "$"')
  .optional();

export const batchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('get'),
    ref: batchRefSchema,
    node_id: z.string(),
  }),
  z.object({
    op: z.literal('insert'),
    ref: batchRefSchema,
    parent_id: z.string(),
    node: z.record(z.unknown()),
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal('update'),
    ref: batchRefSchema,
    node_id: z.string(),
    props: z.record(z.unknown()),
  }),
  z.object({
    op: z.literal('delete'),
    ref: batchRefSchema,
    node_id: z.string(),
  }),
  z.object({
    op: z.literal('move'),
    ref: batchRefSchema,
    node_id: z.string(),
    new_parent_id: z.string(),
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal('page_add'),
    ref: batchRefSchema,
    id: z.string(),
    title: z.string(),
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal('page_remove'),
    ref: batchRefSchema,
    page_id: z.string(),
  }),
  z.object({
    op: z.literal('page_update'),
    ref: batchRefSchema,
    page_id: z.string(),
    title: z.string(),
  }),
]);
