import { z } from 'zod';

export function toZodRawShapeFromSchema(schema: Record<string, unknown>): z.ZodRawShape {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const shape: z.ZodRawShape = {};

  for (const [key, value] of Object.entries(properties ?? {})) {
    const converted = toZodSchema(value);
    shape[key] = required.has(key) ? converted : converted.optional();
  }

  return shape;
}

function toZodSchema(schema: Record<string, unknown>): z.ZodTypeAny {
  if (schema.const !== undefined) {
    const literal = schema.const;
    if (
      typeof literal === 'string' ||
      typeof literal === 'number' ||
      typeof literal === 'boolean' ||
      literal === null
    ) {
      return z.literal(literal);
    }
    return z.any();
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const options = schema.anyOf.map((entry) => toZodSchema(entry as Record<string, unknown>));
    const [first, second, ...rest] = options;
    if (!first || !second) {
      return first ?? z.any();
    }
    return z.union([first, second, ...rest]);
  }

  if (schema.type === 'string') {
    let value = z.string();
    if (typeof schema.minLength === 'number') {
      value = value.min(schema.minLength);
    }
    if (typeof schema.maxLength === 'number') {
      value = value.max(schema.maxLength);
    }
    return value;
  }

  if (schema.type === 'number') {
    let value = z.number();
    if (typeof schema.minimum === 'number') {
      value = value.min(schema.minimum);
    }
    if (typeof schema.maximum === 'number') {
      value = value.max(schema.maximum);
    }
    return value;
  }

  if (schema.type === 'integer') {
    let value = z.number().int();
    if (typeof schema.minimum === 'number') {
      value = value.min(schema.minimum);
    }
    if (typeof schema.maximum === 'number') {
      value = value.max(schema.maximum);
    }
    return value;
  }

  if (schema.type === 'boolean') {
    return z.boolean();
  }

  if (schema.type === 'array') {
    return z.array(toZodSchema((schema.items as Record<string, unknown> | undefined) ?? {}));
  }

  if (schema.type === 'object') {
    if (schema.additionalProperties) {
      return z.record(z.string(), toZodSchema(schema.additionalProperties as Record<string, unknown>));
    }
    return z.object(toZodRawShapeFromSchema(schema));
  }

  return z.any();
}
