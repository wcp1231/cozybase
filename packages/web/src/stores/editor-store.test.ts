import { beforeEach, describe, expect, test } from 'bun:test';

import { resetEditorStore, useEditorStore } from './editor-store';

const baseDoc = {
  pages: [
    {
      path: 'home',
      title: 'Home',
      body: [
        { type: 'text', id: 'text-title', text: 'Hello' },
      ],
    },
  ],
};

describe('editor-store', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  test('enters edit mode with cloned original and draft state', () => {
    useEditorStore.getState().enterEditMode(baseDoc as any);
    const state = useEditorStore.getState();

    expect(state.active).toBe(true);
    expect(state.draftJson).toEqual(baseDoc);
    expect(state.originalJson).toEqual(baseDoc);
    expect(state.draftJson).not.toBe(baseDoc);
    expect(state.dirty).toBe(false);
  });

  test('tracks undo and redo history for edits', () => {
    useEditorStore.getState().enterEditMode(baseDoc as any);
    useEditorStore.getState().applyEdit((draft) => {
      (draft.pages[0].body[0] as any).text = 'Updated';
    });

    expect((useEditorStore.getState().draftJson?.pages[0].body[0] as any).text).toBe('Updated');
    expect(useEditorStore.getState().dirty).toBe(true);

    useEditorStore.getState().undo();
    expect((useEditorStore.getState().draftJson?.pages[0].body[0] as any).text).toBe('Hello');

    useEditorStore.getState().redo();
    expect((useEditorStore.getState().draftJson?.pages[0].body[0] as any).text).toBe('Updated');
  });

  test('clears invalid selected nodes after an edit removes them', () => {
    useEditorStore.getState().enterEditMode(baseDoc as any);
    useEditorStore.getState().setSelectedNodeId('text-title');
    useEditorStore.getState().applyEdit((draft) => {
      draft.pages[0].body.splice(0, 1);
    });

    expect(useEditorStore.getState().selectedNodeId).toBeNull();
  });

  test('does not record no-op edits in undo history', () => {
    useEditorStore.getState().enterEditMode(baseDoc as any);
    useEditorStore.getState().applyEdit(() => {});

    expect(useEditorStore.getState().undoStack).toHaveLength(0);
    expect(useEditorStore.getState().dirty).toBe(false);
  });
});
