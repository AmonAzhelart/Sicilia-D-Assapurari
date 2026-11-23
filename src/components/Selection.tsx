// "La tua selezione": il cliente sceglie quantita', pack e pack promo, vede il totale con i risparmi
// e invia la richiesta d'ordine su WhatsApp (o la condivide/copia se il numero non e' impostato).
import { useEffect, useMemo } from 'react';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';
import {
  faArrowRight, faBagShopping, faGift, faMinus, faPaperPlane, faPlus, faTrash, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import type { Catalog, Promo } from '../types';
import { indexCatalog, isPromoLive, productFromParam, scopeIds, type ProductRef } from '../lib/catalog';
import { useEscape, useScrollLock } from '../lib/hooks';
import {
  addToSelection, bundleKey, bundleStore, clearSelection, selectionStore, setBundleQuantity, setQuantity, type BundleItem,
} from '../lib/personal';
import { bundleQuote, formatPrice, lineQuote, priceInfo, type BundleQuote, type LineQuote } from '../lib/pricing';
import { useNav } from '../lib/router';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { whatsappDigits } from './Home';
import { Icon } from './Icon';
import { Media } from './ui';

/* ---------- Riepilogo della selezione ---------- */

interface Line extends ProductRef {
  /** Chiave nella selezione salvata (codice prodotto, o vecchio slug non ancora convertito). */
  key: string;
  quote: LineQuote;
}

interface BundleLine {
  key: string;
  item: BundleItem;
  promo: Promo;
  /** Prodotti scelti, per ogni scelta della promo. */
  refs: ProductRef[][];
  /** Prezzo di un pack. */
  quote: BundleQuote;
}

export function useSelectionSummary(catalog: Catalog) {
  const items = useStore(selectionStore);
  const bundleItems = useStore(bundleStore);
  return useMemo(() => {
    const index = indexCatalog(catalog);
    const lines: Line[] = [];
    for (const [key, qty] of Object.entries(items)) {
      const ref = productFromParam(index, key);
      if (ref) lines.push({ ...ref, key, quote: lineQuote(ref.product, qty) });
    }
    // pack promo validi; quelli di promo finite o cambiate tornano prodotti singoli (vedi SelectionBar)
    const bundles: BundleLine[] = [];
    const invalid: BundleItem[] = [];
    for (const item of bundleItems) {
      const promo = catalog.promos.find((p) => p.id === item.promo);
      const valid = !!promo && isPromoLive(promo) && promo.slots.length === item.picks.length
        && promo.slots.every((s, i) => item.picks[i].length === s.qty && item.picks[i].every((id) => scopeIds(catalog, s).includes(id) && index.byId.has(id)));
      if (!valid) {
        invalid.push(item);
        continue;
      }
      const refs = item.picks.map((ids) => ids.map((id) => index.byId.get(id)!));
      bundles.push({ key: bundleKey(item), item, promo, refs, quote: bundleQuote(promo, refs.map((r) => r.map((x) => x.product))) });
    }
    const priced = lines.filter((l) => l.quote.total !== null);
    const pricedBundles = bundles.filter((b) => b.quote.total !== null);
    const total = priced.reduce((n, l) => n + l.quote.total!, 0) + pricedBundles.reduce((n, b) => n + b.quote.total! * b.item.qty, 0);
    const list = priced.reduce((n, l) => n + l.quote.list!, 0) + pricedBundles.reduce((n, b) => n + b.quote.list! * b.item.qty, 0);
    const pieces = lines.reduce((n, l) => n + l.quote.qty, 0) + bundles.reduce((n, b) => n + b.item.picks.flat().length * b.item.qty, 0);
    // i totali usano lo stesso formato (virgola o punto) dei prezzi in catalogo
    const like = lines[0]?.product.price ?? bundles[0]?.refs[0]?.[0]?.product.price ?? '€ 0,00';
    const unpriced = lines.length - priced.length + bundles.length - pricedBundles.length;
    return { lines, bundles, invalid, total, savings: Math.max(0, list - total), pieces, unpriced, like };
  }, [catalog, items, bundleItems]);
}

/** Prodotti di una scelta del pack, con i doppioni raggruppati: "2 × Brut". */
const grouped = (refs: ProductRef[]) =>
  [...new Set(refs)].map((ref) => ({ product: ref.product, count: refs.filter((r) => r === ref).length }));

export function packNote(quote: LineQuote) {
  return quote.packs.map((p) => `pack da ${p.qty}${p.count > 1 ? ` ×${p.count}` : ''}`).join(' + ');
}

/* ---------- Quantita' ---------- */

export function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) {
  const clamp = (n: number) => Math.min(999, Math.max(min, Math.round(n) || min));
  return (
    <div className="qty-stepper" role="group" aria-label="Quantità">
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label="Diminuisci">
        <Icon icon={faMinus} />
      </button>
      <input type="number" inputMode="numeric" min={min} max={999} value={value} aria-label="Quantità"
        onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={value >= 999} aria-label="Aumenta">
        <Icon icon={faPlus} />
      </button>
    </div>
  );
}

/* ---------- Pannello "La tua selezione" ---------- */

function buildMessage(catalog: Catalog, summary: ReturnType<typeof useSelectionSummary>) {
  const rows = summary.lines.map(({ product, quote }) => {
    const name = [product.name, product.brand].filter(Boolean).join(' – ');
    const packs = quote.packs.length ? ` (${packNote(quote)})` : '';
    const price = quote.total !== null ? formatPrice(quote.total, product.price) : 'prezzo su richiesta';
    return `• ${quote.qty} × ${name}${packs}: ${price}`;
  });
  for (const { promo, refs, quote, item } of summary.bundles) {
    const like = refs[0]?.[0]?.product.price ?? '';
    const price = quote.total !== null ? formatPrice(quote.total * item.qty, like) : 'prezzo su richiesta';
    rows.push(`• ${item.qty} × Pack «${promo.title}»${promo.discount ? ` (-${promo.discount}%)` : ''}: ${price}`);
    promo.slots.forEach((slot, i) => grouped(refs[i]).forEach(({ product, count }) => {
      const name = [product.name, product.brand].filter(Boolean).join(' – ');
      rows.push(`   – ${slot.free ? 'Omaggio: ' : ''}${count > 1 ? `${count} × ` : ''}${name}`);
    }));
  }
  return [
    `Buongiorno! Vorrei richiedere questi prodotti dal catalogo ${catalog.title || "Sicilia D'Assapurari"}:`,
    '',
    ...rows,
    '',
    `Totale indicativo: ${formatPrice(summary.total, summary.like)}${summary.savings > 0.004 ? ` (risparmio ${formatPrice(summary.savings, summary.like)})` : ''}`,
    '',
    'Grazie!',
  ].join('\n');
}

export function SelectionDrawer({ catalog }: { catalog: Catalog }) {
  const nav = useNav();
  const summary = useSelectionSummary(catalog);
  const phone = whatsappDigits(catalog.whatsapp);
  useScrollLock(true);
  useEscape(true, nav.closeSelection);

  const send = async () => {
    const text = buildMessage(catalog, summary);
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      return;
    }
    try {
      if (navigator.share) await navigator.share({ title: 'Richiesta prodotti', text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Richiesta copiata: incollala in un messaggio o in una email.');
      }
    } catch { /* condivisione annullata */ }
  };

  return (
    <div className="drawer-overlay" onClick={nav.closeSelection}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="La tua selezione" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="drawer-kicker">Richiesta d'ordine</span>
            <h2 className="drawer-title">La tua selezione</h2>
          </div>
          <button type="button" className="search-close" onClick={nav.closeSelection} aria-label="Chiudi selezione">
            <Icon icon={faXmark} />
          </button>
        </div>

        {summary.lines.length || summary.bundles.length ? (
          <>
            <div className="drawer-list">
              {summary.bundles.map((line) => <BundleLineView key={line.key} line={line} />)}
              {summary.lines.map((line) => <SelectionLine key={line.key} line={line} />)}
            </div>
            <div className="drawer-foot">
              <div className="drawer-row"><span>Prodotti</span><span>{summary.pieces} pz</span></div>
              {summary.savings > 0.004 && (
                <div className="drawer-row saving"><span>Risparmio con offerte</span><span>− {formatPrice(summary.savings, summary.like)}</span></div>
              )}
              <div className="drawer-row total"><span>Totale indicativo</span><strong>{formatPrice(summary.total, summary.like)}</strong></div>
              <p className="drawer-note">
                Spedizione gratuita. Prezzi e disponibilità vengono confermati alla risposta
                {summary.unpriced ? `; ${summary.unpriced} prodotti con prezzo su richiesta` : ''}.
              </p>
              <button type="button" className="buy-btn wide" onClick={send}>
                <Icon icon={phone ? faWhatsapp : faPaperPlane} />
                <span>{phone ? 'Invia la richiesta su WhatsApp' : 'Invia la richiesta'}</span>
              </button>
              <button type="button" className="drawer-clear" onClick={() => { clearSelection(); toast('Selezione svuotata.', 'info'); }}>
                Svuota la selezione
              </button>
            </div>
          </>
        ) : (
          <div className="drawer-empty">
            <Icon icon={faBagShopping} />
            <div className="drawer-empty-title">La selezione è vuota</div>
            <p>Apri un prodotto e tocca «Aggiungi»: qui trovi quantità, offerte pack e il totale, pronti da inviare.</p>
            <button type="button" className="hero-cta primary" onClick={nav.goHome}>Esplora il catalogo</button>
          </div>
        )}
      </aside>
    </div>
  );
}

function SelectionLine({ line }: { line: Line }) {
  const nav = useNav();
  const { product, quote, key } = line;
  const price = priceInfo(product);
  const saving = quote.list !== null && quote.total !== null ? quote.list - quote.total : 0;
  return (
    <div className="sel-line">
      <button type="button" className="sel-thumb" onClick={() => nav.openProduct(product.uid)} aria-label={`Apri ${product.name}`}>
        <Media className="sel-media" imgClassName="sel-img" src={product.images[0] || ''} mode={product.imagesMode[0]}
          variant="search" alt="" placeholder={<div className="mini-no-img"><Icon icon={faImage} /></div>} />
      </button>
      <div className="sel-info">
        <div className="sel-brand">{product.brand}</div>
        <button type="button" className="sel-name" onClick={() => nav.openProduct(product.uid)}>{product.name}</button>
        <div className="sel-unit">
          {price.label} cad.{quote.packs.length > 0 && <span className="sel-pack"> · {packNote(quote)}</span>}
        </div>
        <div className="sel-controls">
          <Stepper value={quote.qty} onChange={(n) => setQuantity(key, n)} />
          <div className="sel-total">
            {saving > 0.004 && <s>{formatPrice(quote.list!, product.price)}</s>}
            <strong>{quote.total !== null ? formatPrice(quote.total, product.price) : 'Su richiesta'}</strong>
          </div>
        </div>
      </div>
      <button type="button" className="sel-remove" onClick={() => setQuantity(key, 0)} aria-label={`Rimuovi ${product.name}`}>
        <Icon icon={faTrash} />
      </button>
    </div>
  );
}

function BundleLineView({ line }: { line: BundleLine }) {
  const nav = useNav();
  const { promo, refs, quote, item, key } = line;
  const first = refs.flat()[0]?.product;
  const like = first?.price ?? '';
  const saving = quote.list !== null && quote.total !== null ? quote.list - quote.total : 0;
  return (
    <div className="sel-line is-bundle">
      <button type="button" className="sel-thumb" onClick={() => nav.openPromo(promo.id)} aria-label={`Apri la promozione ${promo.title}`}>
        <Media className="sel-media" imgClassName="sel-img" src={first?.images[0] || ''} mode={first?.imagesMode[0]}
          variant="search" alt="" placeholder={<div className="mini-no-img"><Icon icon={faImage} /></div>} />
        <span className="sel-bundle-badge"><Icon icon={faGift} /></span>
      </button>
      <div className="sel-info">
        <div className="sel-brand">Pack promo{promo.discount ? ` · -${promo.discount}%` : ''}</div>
        <button type="button" className="sel-name" onClick={() => nav.openPromo(promo.id)}>{promo.title}</button>
        <ul className="sel-bundle-items">
          {promo.slots.flatMap((slot, i) => grouped(refs[i]).map(({ product, count }) => (
            <li key={`${i}-${product.id}`}>{slot.free && <em>Omaggio</em>}{count > 1 && `${count} × `}{product.name}</li>
          )))}
        </ul>
        <div className="sel-controls">
          <Stepper value={item.qty} onChange={(n) => setBundleQuantity(key, n)} />
          <div className="sel-total">
            {saving > 0.004 && <s>{formatPrice(quote.list! * item.qty, like)}</s>}
            <strong>{quote.total !== null ? formatPrice(quote.total * item.qty, like) : 'Su richiesta'}</strong>
          </div>
        </div>
      </div>
      <button type="button" className="sel-remove" onClick={() => setBundleQuantity(key, 0)} aria-label={`Rimuovi il pack ${promo.title}`}>
        <Icon icon={faTrash} />
      </button>
    </div>
  );
}

/** Barra flottante su mobile: riepilogo sempre a portata di pollice. */
export function SelectionBar({ catalog }: { catalog: Catalog }) {
  const nav = useNav();
  const { pieces, total, like, lines, invalid } = useSelectionSummary(catalog);
  // pack di promo finite o cambiate: i prodotti restano nella selezione, a prezzo normale
  useEffect(() => {
    if (!invalid.length) return;
    bundleStore.set((list) => list.filter((b) => !invalid.includes(b)));
    for (const b of invalid) for (const id of b.picks.flat()) addToSelection(id, b.qty);
    toast('Una promozione è terminata: i suoi prodotti restano nella selezione a prezzo normale.', 'info');
  }, [invalid]);
  // selezione riallineata ai codici prodotto: via i prodotti tolti dal catalogo, vecchi slug convertiti
  const items = useStore(selectionStore);
  useEffect(() => {
    const next: Record<string, number> = {};
    for (const { key, product } of lines) next[product.id] = Math.min(999, (next[product.id] ?? 0) + items[key]);
    if (JSON.stringify(next) !== JSON.stringify(items)) selectionStore.set(next);
  }, [items, lines]);
  if (!pieces) return null;
  return (
    <button type="button" className="selection-bar" onClick={nav.openSelection}>
      <span className="selection-bar-icon"><Icon icon={faBagShopping} /><span className="count-badge">{pieces}</span></span>
      <span className="selection-bar-label">La tua selezione</span>
      <strong>{formatPrice(total, like)}</strong>
      <Icon icon={faArrowRight} />
    </button>
  );
}
