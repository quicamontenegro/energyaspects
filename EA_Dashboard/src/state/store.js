import { cloneState } from './defaults.js';

export function createStore(initialState) {
  let state = cloneState(initialState);
  const listeners = new Set();

  const api = {
    getState() {
      return cloneState(state);
    },
    replace(nextState) {
      state = cloneState(nextState);
      listeners.forEach((listener) => listener(api.getState()));
    },
    update(updater) {
      const draft = cloneState(state);
      updater(draft);
      state = draft;
      listeners.forEach((listener) => listener(api.getState()));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return api;
}