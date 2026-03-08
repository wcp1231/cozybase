import { create } from 'zustand';
import { findNodeById, type PagesJson } from '@cozybase/ui';

const MAX_HISTORY = 50;

export interface EditorState {
  active: boolean;
  originalJson: PagesJson | null;
  draftJson: PagesJson | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  undoStack: PagesJson[];
  redoStack: PagesJson[];
  dirty: boolean;
  submitting: boolean;
  enterEditMode: (pagesJson: PagesJson) => void;
  exitEditMode: () => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setHoveredNodeId: (nodeId: string | null) => void;
  applyEdit: (mutator: (draft: PagesJson) => void) => void;
  undo: () => void;
  redo: () => void;
  reloadFromServer: (pagesJson: PagesJson) => void;
  submit: (appName: string) => Promise<void>;
}

function clonePagesJson(value: PagesJson): PagesJson {
  return structuredClone(value);
}

function serializePagesJson(value: PagesJson | null): string {
  return value ? JSON.stringify(value) : '';
}

function computeDirty(originalJson: PagesJson | null, draftJson: PagesJson | null): boolean {
  return serializePagesJson(originalJson) !== serializePagesJson(draftJson);
}

function trimHistory(history: PagesJson[]): PagesJson[] {
  return history.length > MAX_HISTORY ? history.slice(history.length - MAX_HISTORY) : history;
}

function sanitizeSelectedNodeId(draftJson: PagesJson, selectedNodeId: string | null): string | null {
  if (!selectedNodeId) return null;
  return findNodeById(draftJson, selectedNodeId) ? selectedNodeId : null;
}

const initialState = {
  active: false,
  originalJson: null,
  draftJson: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  undoStack: [] as PagesJson[],
  redoStack: [] as PagesJson[],
  dirty: false,
  submitting: false,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  enterEditMode(pagesJson) {
    const snapshot = clonePagesJson(pagesJson);
    set({
      active: true,
      originalJson: snapshot,
      draftJson: clonePagesJson(snapshot),
      selectedNodeId: null,
      hoveredNodeId: null,
      undoStack: [],
      redoStack: [],
      dirty: false,
      submitting: false,
    });
  },

  exitEditMode() {
    set(initialState);
  },

  setSelectedNodeId(nodeId) {
    set({ selectedNodeId: nodeId });
  },

  setHoveredNodeId(nodeId) {
    set({ hoveredNodeId: nodeId });
  },

  applyEdit(mutator) {
    const state = get();
    if (!state.draftJson) return;

    const previous = clonePagesJson(state.draftJson);
    const next = clonePagesJson(state.draftJson);
    mutator(next);
    if (serializePagesJson(previous) === serializePagesJson(next)) return;

    set({
      draftJson: next,
      undoStack: trimHistory([...state.undoStack, previous]),
      redoStack: [],
      selectedNodeId: sanitizeSelectedNodeId(next, state.selectedNodeId),
      hoveredNodeId: sanitizeSelectedNodeId(next, state.hoveredNodeId),
      dirty: computeDirty(state.originalJson, next),
    });
  },

  undo() {
    const state = get();
    const previous = state.undoStack.at(-1);
    if (!state.draftJson || !previous) return;

    const current = clonePagesJson(state.draftJson);
    const restored = clonePagesJson(previous);

    set({
      draftJson: restored,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current],
      selectedNodeId: sanitizeSelectedNodeId(restored, state.selectedNodeId),
      hoveredNodeId: sanitizeSelectedNodeId(restored, state.hoveredNodeId),
      dirty: computeDirty(state.originalJson, restored),
    });
  },

  redo() {
    const state = get();
    const nextValue = state.redoStack.at(-1);
    if (!state.draftJson || !nextValue) return;

    const current = clonePagesJson(state.draftJson);
    const restored = clonePagesJson(nextValue);

    set({
      draftJson: restored,
      undoStack: trimHistory([...state.undoStack, current]),
      redoStack: state.redoStack.slice(0, -1),
      selectedNodeId: sanitizeSelectedNodeId(restored, state.selectedNodeId),
      hoveredNodeId: sanitizeSelectedNodeId(restored, state.hoveredNodeId),
      dirty: computeDirty(state.originalJson, restored),
    });
  },

  reloadFromServer(pagesJson) {
    const snapshot = clonePagesJson(pagesJson);
    set((state) => ({
      originalJson: snapshot,
      draftJson: clonePagesJson(snapshot),
      undoStack: [],
      redoStack: [],
      selectedNodeId: sanitizeSelectedNodeId(snapshot, state.selectedNodeId),
      hoveredNodeId: null,
      dirty: false,
      submitting: false,
    }));
  },

  async submit(appName) {
    const state = get();
    if (!state.draftJson) return;

    set({ submitting: true });
    try {
      const response = await fetch(`/api/v1/apps/${appName}/files/ui/pages.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: JSON.stringify(state.draftJson, null, 2),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const snapshot = clonePagesJson(state.draftJson);
      set((current) => ({
        originalJson: snapshot,
        draftJson: clonePagesJson(snapshot),
        dirty: false,
        submitting: false,
        selectedNodeId: sanitizeSelectedNodeId(snapshot, current.selectedNodeId),
        hoveredNodeId: sanitizeSelectedNodeId(snapshot, current.hoveredNodeId),
      }));
    } catch (error) {
      set({ submitting: false });
      throw error;
    }
  },
}));

export function resetEditorStore() {
  useEditorStore.setState(initialState);
}
