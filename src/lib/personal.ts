// Dati personali del cliente, salvati solo nel suo browser:
// la selezione (richiesta d'ordine) e i prodotti visti di recente. Chiave = slug del prodotto.
import { createStore } from './store';

const SELECTION_KEY = 'sda_selection_v1';
const RECENT_KEY = 'sda_recent_v1';

function load<T>(key: string, valid: (value: unknown) => value is T, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* memoria piena o navigazione privata: resta valido per la sessione */ }
}

const isQuantities = (v: unknown): v is Record<string, number> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((n) => Number.isInteger(n) && n > 0);
const isSlugs = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** slug prodotto -> quantita', nell'ordine di inserimento. */
export const selectionStore = createStore<Record<string, number>>(load(SELECTION_KEY, isQuantities, {}));
export const recentStore = createStore<string[]>(load(RECENT_KEY, isSlugs, []));

selectionStore.subscribe(() => persist(SELECTION_KEY, selectionStore.get()));
recentStore.subscribe(() => persist(RECENT_KEY, recentStore.get()));

// selezione allineata tra piu' schede aperte
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SELECTION_KEY) selectionStore.set(load(SELECTION_KEY, isQuantities, {}));
  });
}

export function setQuantity(slug: string, qty: number) {
  selectionStore.set((items) => {
    const next = { ...items };
    if (qty > 0) next[slug] = Math.min(999, Math.round(qty));
    else delete next[slug];
    return next;
  });
}

export const addToSelection = (slug: string, qty: number) => setQuantity(slug, (selectionStore.get()[slug] ?? 0) + qty);
export const clearSelection = () => selectionStore.set({});

export function markViewed(slug: string) {
  recentStore.set((list) => (list[0] === slug ? list : [slug, ...list.filter((s) => s !== slug)].slice(0, 12)));
}
