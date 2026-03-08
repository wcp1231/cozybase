import { describe, expect, it } from 'bun:test';

import {
  componentSchemaMap,
  getComponentFieldMeta,
  getComponentSchemaForType,
  getComponentSchemaShape,
  listComponentSchemaTypes,
} from '../schema-map';

describe('schema-map', () => {
  it('returns per-type schemas for builtin components', () => {
    expect(getComponentSchemaForType('text')).toBe(componentSchemaMap.text);
    expect(getComponentSchemaForType('button')).toBe(componentSchemaMap.button);
    expect(getComponentSchemaForType('unknown-custom')).toBeNull();
  });

  it('exposes schema shapes for property introspection', () => {
    const shape = getComponentSchemaShape('button');
    expect(shape).not.toBeNull();
    expect(Object.keys(shape ?? {})).toEqual(expect.arrayContaining(['id', 'type', 'label', 'action']));
  });

  it('lists all builtin component schema types', () => {
    const types = listComponentSchemaTypes();
    expect(types).toContain('text');
    expect(types).toContain('date-picker');
    expect(types).toHaveLength(Object.keys(componentSchemaMap).length);
  });

  it('returns field metadata for property introspection', () => {
    expect(getComponentFieldMeta('button', 'label')).toEqual({
      kind: 'string',
      optional: false,
    });
    expect(getComponentFieldMeta('button', 'variant')).toEqual({
      kind: 'enum',
      optional: true,
      enumValues: ['primary', 'secondary', 'danger', 'ghost'],
    });
  });
});
