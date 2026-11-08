/** Undo/redo history for editor objects with support for continuous gestures. */
import { useCallback, useReducer } from 'react';
import type { EditorObject } from '../../pdf/engines/annotations';

interface State {
  past: EditorObject[][];
  present: EditorObject[];
  future: EditorObject[][];
  /** Redo stack set aside by a checkpoint, restored if the gesture changes nothing. */
  held: EditorObject[][] | null;
}

type Action =
  | { type: 'set'; value: EditorObject[]; record: boolean }
  | { type: 'checkpoint' }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

const LIMIT = 150;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set':
      return action.record ? { past: [...state.past, state.present].slice(-LIMIT), present: action.value, future: [], held: null } : { ...state, present: action.value };
    case 'checkpoint':
      return { past: [...state.past, state.present].slice(-LIMIT), present: state.present, future: [], held: state.held ?? state.future };
    case 'commit': {
      // Drop the checkpoint if the gesture didn't change anything (and keep Redo available).
      const last = state.past[state.past.length - 1];
      return last === state.present ? { ...state, past: state.past.slice(0, -1), future: state.held ?? state.future, held: null } : { ...state, held: null };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1]!;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], held: null };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present], present: next!, future: rest, held: null };
    }
    case 'reset':
      return { past: [], present: [], future: [], held: null };
  }
}

export function useEditorHistory() {
  const [state, dispatch] = useReducer(reducer, { past: [], present: [], future: [], held: null });
  return {
    objects: state.present,
    set: useCallback((value: EditorObject[], record = true) => dispatch({ type: 'set', value, record }), []),
    checkpoint: useCallback(() => dispatch({ type: 'checkpoint' }), []),
    commit: useCallback(() => dispatch({ type: 'commit' }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    reset: useCallback(() => dispatch({ type: 'reset' }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
