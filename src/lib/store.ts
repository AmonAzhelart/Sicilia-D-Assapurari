import { useSyncExternalStore } from 'react';
import type { Catalog } from '../types';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useStore = <T,>(store: Store<T>): T => useSyncExternalStore(store.subscribe, store.get, store.get);

/** Pagina categoria: sottocategoria in vista durante lo scorrimento e sottocategorie con prodotti dopo i filtri. */
export const sectionStore = createStore<{ active: string | null; visible: string[] | null }>({ active: null, visible: null });

/** Stato unico del catalogo, condiviso tra app pubblica e admin. */
export const catalogStore = createStore<Catalog | null>(null);
