// Dati personali del cliente, salvati solo nel suo browser:
// la selezione (richiesta d'ordine: prodotti e pack promo) e i prodotti visti di recente. Chiave = codice del prodotto
// (le chiavi salvate prima dei codici sono vecchi slug "brand-nome": li risolve productFromParam).
import { createStore } from './store';

const SELECTION_KEY = 'sda_selection_v1';
const RECENT_KEY = 'sda_recent_v1';
const BUNDLES_KEY = 'sda_bundles_v1';

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

/** Pack promo nella selezione: codici scelti per ogni scelta della promo, e quanti pack. */
export interface BundleItem {
  promo: string;
  picks: string[][];
  qty: number;
}

const isBundles = (v: unknown): v is BundleItem[] => Array.isArray(v) && v.every((b) =>
  !!b && typeof b.promo === 'string' && Number.isInteger(b.qty) && b.qty > 0
  && Array.isArray(b.picks) && b.picks.every((slot: unknown) => isSlugs(slot)));

/** codice prodotto -> quantita', nell'ordine di inserimento. */
export const selectionStore = createStore<Record<string, number>>(load(SELECTION_KEY, isQuantities, {}));
export const recentStore = createStore<string[]>(load(RECENT_KEY, isSlugs, []));
export const bundleStore = createStore<BundleItem[]>(load(BUNDLES_KEY, isBundles, []));

selectionStore.subscribe(() => persist(SELECTION_KEY, selectionStore.get()));
recentStore.subscribe(() => persist(RECENT_KEY, recentStore.get()));
bundleStore.subscribe(() => persist(BUNDLES_KEY, bundleStore.get()));

// selezione allineata tra piu' schede aperte
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SELECTION_KEY) selectionStore.set(load(SELECTION_KEY, isQuantities, {}));
    if (e.key === BUNDLES_KEY) bundleStore.set(load(BUNDLES_KEY, isBundles, []));
  });
}

export function setQuantity(key: string, qty: number) {
  selectionStore.set((items) => {
    const next = { ...items };
    if (qty > 0) next[key] = Math.min(999, Math.round(qty));
    else delete next[key];
    return next;
  });
}

export const addToSelection = (id: string, qty: number) => setQuantity(id, (selectionStore.get()[id] ?? 0) + qty);
export const clearSelection = () => {
  selectionStore.set({});
  bundleStore.set([]);
};

/** Stesso pack = stessa promo e stessi prodotti (l'ordine dentro una scelta non conta). */
export const bundleKey = (b: Pick<BundleItem, 'promo' | 'picks'>) => JSON.stringify([b.promo, b.picks.map((s) => [...s].sort())]);

export function addBundle(promo: string, picks: string[][]) {
  const key = bundleKey({ promo, picks });
  bundleStore.set((list) => (list.some((b) => bundleKey(b) === key)
    ? list.map((b) => (bundleKey(b) === key ? { ...b, qty: Math.min(99, b.qty + 1) } : b))
    : [...list, { promo, picks: picks.map((s) => [...s].sort()), qty: 1 }]));
}

export function setBundleQuantity(key: string, qty: number) {
  bundleStore.set((list) => (qty > 0
    ? list.map((b) => (bundleKey(b) === key ? { ...b, qty: Math.min(99, Math.round(qty)) } : b))
    : list.filter((b) => bundleKey(b) !== key)));
}

export function markViewed(id: string) {
  recentStore.set((list) => (list[0] === id ? list : [id, ...list.filter((s) => s !== id)].slice(0, 12)));
}
