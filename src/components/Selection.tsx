// "La tua selezione": il cliente sceglie quantita' e pack, vede il totale con i risparmi
// e invia la richiesta d'ordine su WhatsApp (o la condivide/copia se il numero non e' impostato).
import { useEffect, useMemo } from 'react';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';
import {
  faArrowRight, faBagShopping, faMinus, faPaperPlane, faPlus, faTrash, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import type { Catalog } from '../types';
import { indexCatalog, type ProductRef } from '../lib/catalog';
import { useEscape, useScrollLock } from '../lib/hooks';
import { clearSelection, selectionStore, setQuantity } from '../lib/personal';
import { formatPrice, lineQuote, priceInfo, type LineQuote } from '../lib/pricing';
import { useNav } from '../lib/router';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { whatsappDigits } from './Home';
import { Icon } from './Icon';
import { Media } from './ui';

/* ---------- Riepilogo della selezione ---------- */

interface Line extends ProductRef {
  slug: string;
  quote: LineQuote;
}

export function useSelectionSummary(catalog: Catalog) {
  const items = useStore(selectionStore);
  return useMemo(() => {
    const index = indexCatalog(catalog);
    const lines: Line[] = [];
    for (const [slug, qty] of Object.entries(items)) {
      const ref = index.productBySlug.get(slug);
      if (ref) lines.push({ ...ref, slug, quote: lineQuote(ref.product, qty) });
    }
    const priced = lines.filter((l) => l.quote.total !== null);
    const total = priced.reduce((n, l) => n + l.quote.total!, 0);
    const list = priced.reduce((n, l) => n + l.quote.list!, 0);
    const pieces = lines.reduce((n, l) => n + l.quote.qty, 0);
    // i totali usano lo stesso formato (virgola o punto) dei prezzi in catalogo
    const like = lines[0]?.product.price ?? '€ 0,00';
    return { lines, total, savings: Math.max(0, list - total), pieces, unpriced: lines.length - priced.length, like };
  }, [catalog, items]);
}

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

        {summary.lines.length ? (
          <>
            <div className="drawer-list">
              {summary.lines.map((line) => <SelectionLine key={line.slug} line={line} />)}
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
  const { product, quote, slug } = line;
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
          <Stepper value={quote.qty} onChange={(n) => setQuantity(slug, n)} />
          <div className="sel-total">
            {saving > 0.004 && <s>{formatPrice(quote.list!, product.price)}</s>}
            <strong>{quote.total !== null ? formatPrice(quote.total, product.price) : 'Su richiesta'}</strong>
          </div>
        </div>
      </div>
      <button type="button" className="sel-remove" onClick={() => setQuantity(slug, 0)} aria-label={`Rimuovi ${product.name}`}>
        <Icon icon={faTrash} />
      </button>
    </div>
  );
}

/** Barra flottante su mobile: riepilogo sempre a portata di pollice. */
export function SelectionBar({ catalog }: { catalog: Catalog }) {
  const nav = useNav();
  const { pieces, total, like, lines } = useSelectionSummary(catalog);
  // prodotti tolti dal catalogo nel frattempo: rimossi anche dalla selezione
  const items = useStore(selectionStore);
  useEffect(() => {
    const known = new Set(lines.map((l) => l.slug));
    Object.keys(items).filter((slug) => !known.has(slug)).forEach((slug) => setQuantity(slug, 0));
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
