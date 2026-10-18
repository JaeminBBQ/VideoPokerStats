import { useSyncExternalStore } from 'react';
import type { AppState, Store } from '../app/store.ts';

/** The store's current state; re-renders on every change (getState is reference-stable between changes). */
export const useAppState = (store: Store): AppState => useSyncExternalStore(store.subscribe, store.getState, store.getState);

/**
 * Moves the glasses cycle to `target` using only the store's next/prev/reset actions (the store has no direct
 * setter). The store clamps, so stop early if a step makes no progress.
 */
export function setCycleTo(store: Store, target: number): void {
  if (target <= 0) return store.resetHold();
  let guard = 64;
  while (store.getState().cycleIndex !== target && guard-- > 0) {
    const before = store.getState().cycleIndex;
    if (before < target) store.nextHold();
    else store.prevHold();
    if (store.getState().cycleIndex === before) break;
  }
}
