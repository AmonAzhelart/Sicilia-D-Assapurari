// Prezzi, sconti e pack. Il prezzo resta una stringa libera nel JSON ("€ 35.00", "€ 7,50"):
// qui viene interpretato solo per i calcoli. Campi opzionali sul prodotto:
//   discount: 20                         -> prodotto scontato del 20%
//   packs: [{ qty: 10, discount: 10 }]   -> 10 pezzi, somma dei prezzi scontata del 10%
// Lo sconto del pack si applica al prezzo unitario gia' scontato.
import type { Pack, Product } from '../types';

/** "€ 35.00" | "€ 7,50" | "€ 1.234,50" -> numero; null se non interpretabile. */
export function parsePrice(text: string): number | null {
  const raw = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(raw)) return null;
  const last = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  if (last < 0) return Number(raw);
  const int = raw.slice(0, last).replace(/[.,]/g, '');
  const tail = raw.slice(last + 1);
  // un solo separatore seguito da 3 cifre indica le migliaia ("1.500")
  const thousands = tail.length === 3 && !/[.,]/.test(raw.slice(0, last));
  const value = Number(thousands ? int + tail : `${int}.${tail}`);
  return Number.isFinite(value) ? value : null;
}

/** Formatta come il prezzo di riferimento (virgola o punto decimale), es. "€ 31.50". */
export function formatPrice(value: number, like = ''): string {
  const comma = /\d,\d{1,2}\s*$/.test(like);
  const [int, dec] = value.toFixed(2).split('.');
  return `€ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, comma ? '.' : ',')}${comma ? ',' : '.'}${dec}`;
}

const percent = (value: unknown) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(99, Math.max(0, n)) : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const applyDiscount = (amount: number, pct: number) => round2(amount * (1 - pct / 100));

export interface PriceInfo {
  base: number | null;
  /** Prezzo unitario dopo lo sconto prodotto. */
  final: number | null;
  /** Percentuale di sconto effettivamente applicabile (0 se il prezzo non e' interpretabile). */
  discount: number;
  /** Testo da mostrare come prezzo finale. */
  label: string;
}

export function priceInfo(product: Product): PriceInfo {
  const base = parsePrice(product.price);
  const discount = base === null ? 0 : percent(product.discount);
  const final = base === null ? null : applyDiscount(base, discount);
  return { base, final, discount, label: discount && final !== null ? formatPrice(final, product.price) : product.price };
}

export interface PackOffer extends Pack {
  /** Somma dei prezzi unitari, prima dello sconto pack. */
  full: number | null;
  total: number | null;
  perUnit: number | null;
}

export function packOffer(unitPrice: number | null, pack: Pack): PackOffer {
  const qty = Math.floor(Number(pack.qty)) || 0;
  const discount = percent(pack.discount);
  if (unitPrice === null || qty < 1) return { qty, discount, full: null, total: null, perUnit: null };
  const full = round2(unitPrice * qty);
  const total = applyDiscount(full, discount);
  return { qty, discount, full, total, perUnit: round2(total / qty) };
}

/** Pack validi (almeno 2 pezzi), in ordine di quantita'. */
export function packOffers(product: Product): PackOffer[] {
  if (!Array.isArray(product.packs)) return [];
  const unit = priceInfo(product).final;
  return product.packs
    .map((pack) => packOffer(unit, pack))
    .filter((offer) => offer.qty >= 2)
    .sort((a, b) => a.qty - b.qty);
}

export interface LineQuote {
  qty: number;
  /** Totale senza sconti (prezzo pieno x quantita'). */
  list: number | null;
  /** Totale da pagare, con sconto prodotto e miglior combinazione di pack. */
  total: number | null;
  /** Pack applicati, dal piu' grande. */
  packs: Array<{ qty: number; discount: number; count: number }>;
}

/**
 * Prezzo di una quantita': sceglie la combinazione di pack piu' conveniente
 * (programmazione dinamica: es. 12 pezzi con pack da 6 e da 10 -> 6+6, non 10+2).
 */
export function lineQuote(product: Product, qty: number): LineQuote {
  const { base, final } = priceInfo(product);
  if (base === null || final === null || qty < 1) return { qty, list: null, total: null, packs: [] };
  const offers = packOffers(product).filter((o) => o.total !== null && o.qty <= qty);
  const cents = (n: number) => Math.round(n * 100);
  const best = new Array<number>(qty + 1).fill(0);
  const pick = new Array<number>(qty + 1).fill(-1);
  for (let n = 1; n <= qty; n++) {
    best[n] = best[n - 1] + cents(final);
    offers.forEach((o, i) => {
      if (o.qty > n) return;
      const cost = best[n - o.qty] + cents(o.total!);
      if (cost < best[n]) {
        best[n] = cost;
        pick[n] = i;
      }
    });
  }
  const counts = new Map<number, number>();
  for (let n = qty; n > 0;) {
    if (pick[n] < 0) n -= 1;
    else {
      counts.set(pick[n], (counts.get(pick[n]) ?? 0) + 1);
      n -= offers[pick[n]].qty;
    }
  }
  const packs = [...counts].map(([i, count]) => ({ qty: offers[i].qty, discount: offers[i].discount, count }))
    .sort((a, b) => b.qty - a.qty);
  return { qty, list: round2(base * qty), total: best[qty] / 100, packs };
}
