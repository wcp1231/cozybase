import { describe, test, expect, beforeEach } from 'bun:test';
import {
  registerBuiltinComponent,
  builtinRegistry,
  getComponent,
  isBuiltinType,
  isCustomType,
} from '../registry';

// Minimal stub for a React component
const FakeComponent = (() => null) as any;
const AnotherComponent = (() => null) as any;

describe('builtinRegistry', () => {
  beforeEach(() => {
    // Clear registry between tests to avoid cross-test pollution
    builtinRegistry.clear();
  });

  test('registers and retrieves a component', () => {
    registerBuiltinComponent('my-widget', FakeComponent);
    expect(builtinRegistry.get('my-widget')).toBe(FakeComponent);
  });

  test('has() returns true for a registered component', () => {
    registerBuiltinComponent('button', FakeComponent);
    expect(builtinRegistry.has('button')).toBe(true);
  });

  test('has() returns false for an unregistered component', () => {
    expect(builtinRegistry.has('nonexistent')).toBe(false);
  });

  test('get() returns undefined for an unregistered type', () => {
    expect(builtinRegistry.get('nonexistent')).toBeUndefined();
  });

  test('can register multiple components', () => {
    registerBuiltinComponent('alpha', FakeComponent);
    registerBuiltinComponent('beta', AnotherComponent);
    expect(builtinRegistry.get('alpha')).toBe(FakeComponent);
    expect(builtinRegistry.get('beta')).toBe(AnotherComponent);
  });

  test('overwriting a registered component replaces it', () => {
    registerBuiltinComponent('replaceable', FakeComponent);
    registerBuiltinComponent('replaceable', AnotherComponent);
    expect(builtinRegistry.get('replaceable')).toBe(AnotherComponent);
  });
});

describe('getComponent', () => {
  beforeEach(() => {
    builtinRegistry.clear();
  });

  test('returns a builtin component when registered', () => {
    registerBuiltinComponent('text', FakeComponent);
    expect(getComponent('text')).toBe(FakeComponent);
  });

  test('returns null for a custom component type (signals template expansion)', () => {
    const customComponents = {
      'my-card': { body: { type: 'text', text: 'hello' } as any },
    };
    expect(getComponent('my-card', customComponents)).toBeNull();
  });

  test('returns null for a completely unknown type', () => {
    expect(getComponent('unknown-type')).toBeNull();
  });

  test('builtin takes precedence over custom with same name', () => {
    registerBuiltinComponent('dual', FakeComponent);
    const customComponents = {
      dual: { body: { type: 'text', text: 'custom' } as any },
    };
    expect(getComponent('dual', customComponents)).toBe(FakeComponent);
  });
});

describe('isBuiltinType', () => {
  beforeEach(() => {
    builtinRegistry.clear();
  });

  test('returns true for registered builtin type', () => {
    registerBuiltinComponent('card', FakeComponent);
    expect(isBuiltinType('card')).toBe(true);
  });

  test('returns false for unregistered type', () => {
    expect(isBuiltinType('unknown')).toBe(false);
  });
});

describe('isCustomType', () => {
  beforeEach(() => {
    builtinRegistry.clear();
  });

  test('returns true for a type in customComponents that is not builtin', () => {
    const customComponents = {
      'custom-widget': { body: { type: 'text', text: '' } as any },
    };
    expect(isCustomType('custom-widget', customComponents)).toBe(true);
  });

  test('returns false for a builtin type even if in customComponents', () => {
    registerBuiltinComponent('builtin-type', FakeComponent);
    const customComponents = {
      'builtin-type': { body: { type: 'text', text: '' } as any },
    };
    expect(isCustomType('builtin-type', customComponents)).toBe(false);
  });

  test('returns false when customComponents is undefined', () => {
    expect(isCustomType('anything')).toBe(false);
  });

  test('returns false for an unknown type not in customComponents', () => {
    const customComponents = {
      other: { body: { type: 'text', text: '' } as any },
    };
    expect(isCustomType('missing', customComponents)).toBe(false);
  });
});
