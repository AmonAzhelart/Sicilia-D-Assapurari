// Promozioni "componi il tuo pack": il cliente sceglie un prodotto per ogni scelta della promo
// (es. 1 panettone + 1 spumante tra quelli proposti) e ottiene lo sconto e/o gli omaggi.
// Vetrina in home, banner nelle categorie, invito nella scheda prodotto, configuratore (?promo=) e editor admin.
import { Fragment, useEffect, useRef, useState } from 'react';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import {
  faArrowRight, faBagShopping, faCheck, faCircleInfo, faFolder, faGift, faLayerGroup, faMagnifyingGlass, faMinus, faPlus, faTrash, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Catalog, Macro, Product, Promo, PromoSlot, Scope } from '../types';
import {
  indexCatalog, isPromoLive, promosOf, scopeIds, searchCatalog, today, type CatalogIndex, type ProductRef,
} from '../lib/catalog';
import { useAdmin } from '../lib/admin';
import { cx, useEscape, useScrollLock } from '../lib/hooks';
import { addBundle } from '../lib/personal';
import { bundleQuote, formatPrice, priceInfo } from '../lib/pricing';
import { useNav } from '../lib/router';
import { catalogStore, createStore, useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Icon } from './Icon';
import { AdminIconButton, LinkBox, Media } from './ui';

/* ---------- Testi e calcoli condivisi ---------- */

const refsOf = (index: CatalogIndex, ids: string[]) =>
  ids.map((id) => index.byId.get(id)).filter((r): r is ProductRef => !!r);

const giftCount = (promo: Promo) => promo.slots.reduce((n, s) => n + (s.free ? s.qty : 0), 0);

/** "-15%", "+1 omaggio" */
export function rewardLabels(promo: Promo): string[] {
  const gifts = giftCount(promo);
  return [
    ...(promo.discount > 0 ? [`-${promo.discount}%`] : []),
    ...(gifts ? [gifts === 1 ? '+1 omaggio' : `+${gifts} omaggi`] : []),
  ];
}

/** "1 Panettone + 1 Spumante" (solo le scelte a pagamento). */
const recipe = (promo: Promo) => promo.slots.filter((s) => !s.free).map((s) => `${s.qty} ${s.label}`).join(' + ');

function endLabel(end?: string): string | null {
  if (!end) return null;
  const days = Math.round((Date.parse(end) - Date.parse(today())) / 86400000);
  if (days < 0) return 'Terminata';
  if (days === 0) return 'Ultimo giorno';
  if (days === 1) return 'Termina domani';
  if (days < 7) return `Ancora ${days + 1} giorni`;
  return `Fino al ${new Date(`${end}T12:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`;
}

/* ---------- Bozza del pack (in memoria: resta mentre il cliente naviga) ---------- */

const draftStore = createStore<Record<string, string[][]>>({});

/** Apre la promo con il prodotto gia' scelto: nella prima scelta libera che lo propone, altrimenti al posto dell'ultimo scelto. */
export function startPromo(catalog: Catalog, promo: Promo, productId: string) {
  draftStore.set((drafts) => {
    const picks = promo.slots.map((_, i) => drafts[promo.id]?.[i] ?? []);
    if (picks.some((p) => p.includes(productId))) return drafts;
    const offered = promo.slots.map((s, i) => (scopeIds(catalog, s).includes(productId) ? i : -1)).filter((i) => i >= 0);
    const i = offered.find((j) => picks[j].length < promo.slots[j].qty) ?? offered[0];
    if (i === undefined) return drafts;
    picks[i] = [...picks[i].slice(0, promo.slots[i].qty - 1), productId];
    return { ...drafts, [promo.id]: picks };
  });
}

/* ---------- Immagini dei prodotti di una scelta, a ventaglio ---------- */

function Fan({ refs, size }: { refs: ProductRef[]; size: 'sm' | 'lg' }) {
  const shown = refs.filter((r) => r.product.images[0]).slice(0, 3);
  return (
    <span className={cx('promo-fan', `is-${size}`)} data-count={shown.length || 1}>
      {shown.length ? shown.map(({ product }) => (
        <Media key={product.uid} className="promo-fan-media" imgClassName="promo-fan-img" src={product.images[0]}
          mode={product.imagesMode[0]} variant="search" alt="" />
      )) : <span className="promo-fan-media is-empty"><Icon icon={faImage} /></span>}
    </span>
  );
}

/** "[panettoni] + [spumanti] = -15%" */
function Equation({ promo, catalog }: { promo: Promo; catalog: Catalog }) {
  const index = indexCatalog(catalog);
  return (
    <div className="promo-eq" aria-hidden="true">
      {/* operatore e termine insieme: andando a capo il "+" apre la riga invece di chiuderla */}
      {promo.slots.map((slot, i) => (
        <span key={i} className="promo-eq-group">
          {i > 0 && <span className="promo-eq-op">+</span>}
          <span className={cx('promo-eq-item', slot.free && 'is-free')}>
            <Fan refs={refsOf(index, scopeIds(catalog, slot))} size="lg" />
            <span className="promo-eq-label">
              {slot.free && <Icon icon={faGift} />} {slot.qty} {slot.label || 'Prodotto'}
            </span>
          </span>
        </span>
      ))}
      {promo.discount > 0 && (
        <span className="promo-eq-group">
          <span className="promo-eq-op">=</span>
          <span className="promo-eq-reward">-{promo.discount}<small>%</small></span>
        </span>
      )}
    </div>
  );
}

/* ---------- Vetrina in home ---------- */

function PromoCard({ promo, catalog }: { promo: Promo; catalog: Catalog }) {
  const nav = useNav();
  const admin = useAdmin();
  const end = endLabel(promo.end);
  const live = isPromoLive(promo);
  return (
    <LinkBox className={cx('promo-card reveal', !live && 'is-off')} href={nav.href({ promo: promo.id })}
      onOpen={() => nav.openPromo(promo.id)} asDiv={!!admin} label={`${promo.title}: crea il tuo pack`}>
      <div className="promo-card-text">
        <div className="promo-card-top">
          <span className="promo-kicker"><Icon icon={faGift} /> Promozione</span>
          {end && <span className="promo-end">{end}</span>}
          {admin && promo.draft && <span className="promo-tag">Bozza</span>}
          {admin && !promo.draft && !live && <span className="promo-tag">Non visibile</span>}
        </div>
        <h3 className="promo-card-title">{promo.title || 'Promozione'}</h3>
        {promo.desc && <p className="promo-card-desc">{promo.desc}</p>}
        <div className="promo-card-foot">
          <span className="hero-cta primary">{admin ? 'Modifica' : 'Crea il tuo pack'} <Icon icon={faArrowRight} /></span>
        </div>
      </div>
      <Equation promo={promo} catalog={catalog} />
    </LinkBox>
  );
}

export function PromoShowcase({ catalog }: { catalog: Catalog }) {
  const nav = useNav();
  const admin = useAdmin();
  const promos = admin ? catalog.promos : catalog.promos.filter((p) => isPromoLive(p));
  if (!promos.length && !admin) return null;
  return (
    <section className="home-section promo-section" id="promo">
      <div className="home-head">
        <div>
          <div className="home-kicker">Componi e risparmia</div>
          <h2 className="home-title">Promozioni</h2>
        </div>
        {admin && (
          <button type="button" className="sheet-admin-btn primary" onClick={() => nav.openPromo(admin.addPromo())}>
            <Icon icon={faPlus} /><span>NUOVA PROMOZIONE</span>
          </button>
        )}
      </div>
      {promos.length ? (
        <div className={cx('promo-grid', promos.length === 1 && 'is-single')}>
          {promos.map((p) => <PromoCard key={p.id} promo={p} catalog={catalog} />)}
        </div>
      ) : (
        <p className="promo-empty">
          Crea una promo pack: il cliente sceglie un prodotto per ogni scelta (es. 1 panettone + 1 spumante)
          e ottiene uno sconto o dei prodotti in omaggio.
        </p>
      )}
    </section>
  );
}

/* ---------- Banner nella pagina categoria ---------- */

export function PromoBanner({ catalog, macro }: { catalog: Catalog; macro: Macro }) {
  const nav = useNav();
  const ids = new Set(macro.products.map((p) => p.id));
  const promos = catalog.promos.filter((p) => isPromoLive(p) && p.slots.some((s) => scopeIds(catalog, s).some((id) => ids.has(id))));
  if (!promos.length) return null;
  return (
    <div className="promo-banners">
      {promos.map((promo) => (
        <a key={promo.id} className="promo-banner" href={nav.href({ promo: promo.id })}
          onClick={(e) => { e.preventDefault(); nav.openPromo(promo.id); }}>
          <span className="promo-banner-icon"><Icon icon={faGift} /></span>
          <span className="promo-banner-text">
            <strong>{promo.title}</strong>
            <span>{recipe(promo)}{rewardLabels(promo).length > 0 && ` → ${rewardLabels(promo).join(' e ')}`}</span>
          </span>
          <span className="promo-banner-cta">Crea il pack <Icon icon={faArrowRight} /></span>
        </a>
      ))}
    </div>
  );
}

/* ---------- Invito nella scheda prodotto ---------- */

export function PromoHint({ product }: { product: Product }) {
  const nav = useNav();
  const catalog = useStore(catalogStore);
  const promos = catalog ? promosOf(catalog, product.id) : [];
  if (!catalog || !promos.length) return null;
  return (
    <div className="pd-promos">
      {promos.map((promo) => {
        const others = promo.slots.filter((s) => !s.free && !scopeIds(catalog, s).includes(product.id));
        return (
          <button key={promo.id} type="button" className="pd-promo"
            onClick={() => { startPromo(catalog, promo, product.id); nav.openPromo(promo.id); }}>
            <span className="pd-promo-icon"><Icon icon={faGift} /></span>
            <span className="pd-promo-text">
              <small>In promozione · {promo.title}</small>
              <strong>
                {others.length ? `Con ${others.map((s) => `${s.qty} ${s.label}`).join(' + ')} a scelta` : 'Componi il tuo pack'}
                {rewardLabels(promo).length > 0 && `: ${rewardLabels(promo).join(' e ')}`}
              </strong>
            </span>
            <span className="pd-promo-cta">Crea il pack <Icon icon={faArrowRight} /></span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Finestra della promo ---------- */

export function PromoSheet({ promo }: { promo: Promo }) {
  const nav = useNav();
  const admin = useAdmin();
  const ref = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useEscape(true, nav.closePromo);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <div className="promo-overlay" onClick={nav.closePromo}>
      <div ref={ref} className="promo-sheet" role="dialog" aria-modal="true" aria-label={promo.title} tabIndex={-1}
        onClick={(e) => e.stopPropagation()}>
        {admin ? <PromoEditor promo={promo} /> : <PromoBuilder promo={promo} />}
      </div>
    </div>
  );
}

function SheetHead({ promo, kicker }: { promo: Promo; kicker: string }) {
  const nav = useNav();
  const end = endLabel(promo.end);
  return (
    <header className="promo-head">
      <div className="promo-head-text">
        <div className="promo-card-top">
          <span className="promo-kicker"><Icon icon={faGift} /> {kicker}</span>
          {end && <span className="promo-end">{end}</span>}
          {rewardLabels(promo).map((r) => <span key={r} className="sale-badge">{r}</span>)}
        </div>
        <h2 className="promo-head-title">{promo.title || 'Promozione'}</h2>
        {promo.desc && <p className="promo-head-desc">{promo.desc}</p>}
      </div>
      <button type="button" className="search-close" onClick={nav.closePromo} aria-label="Chiudi promozione">
        <Icon icon={faXmark} />
      </button>
    </header>
  );
}

/* ---------- Configuratore del pack (cliente) ---------- */

function PromoBuilder({ promo }: { promo: Promo }) {
  const nav = useNav();
  const catalog = useStore(catalogStore)!;
  const drafts = useStore(draftStore);
  const index = indexCatalog(catalog);
  const options = promo.slots.map((slot) => refsOf(index, scopeIds(catalog, slot)));
  // scelte valide anche se nel frattempo il catalogo e' cambiato
  const picks = promo.slots.map((slot, i) =>
    (drafts[promo.id]?.[i] ?? []).filter((id) => scopeIds(catalog, slot).includes(id) && index.byId.has(id)).slice(0, slot.qty));
  const chosen = picks.map((ids) => refsOf(index, ids));
  const quote = bundleQuote(promo, chosen.map((refs) => refs.map((r) => r.product)));
  const missing = promo.slots.map((slot, i) => slot.qty - picks[i].length);
  const complete = missing.every((n) => n === 0);
  const like = options.flat()[0]?.product.price ?? '€ 0,00';
  const saving = quote.list !== null && quote.total !== null ? quote.list - quote.total : 0;

  if (!isPromoLive(promo)) {
    return (
      <>
        <SheetHead promo={promo} kicker="Promozione" />
        <div className="drawer-empty">
          <Icon icon={faGift} />
          <div className="drawer-empty-title">Questa promozione è terminata</div>
          <p>Scopri le altre offerte del catalogo.</p>
          <button type="button" className="hero-cta primary" onClick={nav.goHome}>Vai al catalogo</button>
        </div>
      </>
    );
  }

  const setPicks = (i: number, ids: string[]) =>
    draftStore.set((d) => ({ ...d, [promo.id]: picks.map((p, j) => (j === i ? ids : p)) }));

  const pick = (i: number, id: string) => {
    const slot = promo.slots[i];
    const current = picks[i];
    if (slot.qty === 1) {
      if (current[0] === id) return setPicks(i, []);
      setPicks(i, [id]);
    } else if (current.length < slot.qty) {
      setPicks(i, [...current, id]);
    } else {
      return toast(`Hai già scelto ${slot.qty} ${slot.label}: togline uno con «−» per cambiare.`, 'info');
    }
    // scelta completata: si passa alla prossima ancora da fare
    const filled = slot.qty === 1 || current.length + 1 === slot.qty;
    const next = missing.findIndex((n, j) => j !== i && n > 0);
    if (filled && next >= 0) {
      requestAnimationFrame(() => document.getElementById(`promo-step-${next}`)?.scrollIntoView({
        behavior: document.body.classList.contains('perf-lite') ? 'auto' : 'smooth', block: 'start',
      }));
    }
  };
  const unpick = (i: number, id: string) => {
    const at = picks[i].lastIndexOf(id);
    setPicks(i, picks[i].filter((_, j) => j !== at));
  };

  const add = () => {
    addBundle(promo.id, picks);
    draftStore.set((d) => ({ ...d, [promo.id]: [] }));
    toast(`Pack «${promo.title}» aggiunto alla selezione`);
    nav.closePromo();
  };

  const nextMissing = promo.slots.findIndex((_, i) => missing[i] > 0);
  const hint = nextMissing >= 0 ? `Scegli ancora: ${missing[nextMissing]} ${promo.slots[nextMissing].label}` : '';

  return (
    <>
      <SheetHead promo={promo} kicker="Componi il tuo pack" />
      <div className="promo-body">
        {promo.slots.map((slot, i) => (
          <section key={i} className="promo-step" id={`promo-step-${i}`} aria-labelledby={`promo-step-title-${i}`}>
            <div className="promo-step-head">
              <span className={cx('promo-step-num', missing[i] === 0 && 'is-done')}>
                {missing[i] === 0 ? <Icon icon={faCheck} /> : i + 1}
              </span>
              <div>
                <div className="promo-step-kicker">{slot.free ? <><Icon icon={faGift} /> In omaggio</> : `Scelta ${i + 1}`}</div>
                <h3 className="promo-step-title" id={`promo-step-title-${i}`}>
                  {slot.free ? 'Il tuo omaggio: ' : 'Scegli '}{slot.qty} {slot.label}
                </h3>
              </div>
              <span className="promo-step-count">{picks[i].length}/{slot.qty}</span>
            </div>
            <div className="promo-tiles">
              {options[i].map(({ product }) => (
                <Tile key={product.uid} product={product} slot={slot} count={picks[i].filter((id) => id === product.id).length}
                  onPick={() => pick(i, product.id)} onUnpick={() => unpick(i, product.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <footer className="promo-foot">
        <div className="promo-tray" aria-label="Il tuo pack">
          {promo.slots.map((slot, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="promo-tray-op" aria-hidden="true">+</span>}
              {Array.from({ length: slot.qty }, (_, j) => {
                const product = chosen[i][j]?.product;
                return product ? (
                  <button key={j} type="button" className={cx('promo-tray-item', slot.free && 'is-free')}
                    onClick={() => unpick(i, product.id)} aria-label={`Togli ${product.name}`} title={`Togli ${product.name}`}>
                    <Media className="promo-tray-media" imgClassName="promo-tray-img" src={product.images[0] || ''}
                      mode={product.imagesMode[0]} variant="search" alt=""
                      placeholder={<span className="mini-no-img"><Icon icon={faImage} /></span>} />
                  </button>
                ) : (
                  <button key={j} type="button" className="promo-tray-item is-empty" aria-label={`Scegli ${slot.label}`}
                    onClick={() => document.getElementById(`promo-step-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    {slot.free ? <Icon icon={faGift} /> : i + 1}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="promo-sum">
          <span className="promo-sum-label">{complete ? 'Il tuo pack' : 'Totale finora'}</span>
          <span className="promo-sum-price">
            {saving > 0.004 && <s>{formatPrice(quote.list!, like)}</s>}
            <strong>{quote.total !== null ? formatPrice(quote.total, like) : 'Su richiesta'}</strong>
          </span>
          {saving > 0.004 && <span className="promo-sum-saving">Risparmi {formatPrice(saving, like)}</span>}
        </div>
        <button type="button" className="buy-btn wide" disabled={!complete} onClick={add}>
          {complete
            ? <><Icon icon={faBagShopping} /><span>Aggiungi il pack alla selezione</span></>
            : <span>{hint}</span>}
        </button>
      </footer>
    </>
  );
}

function Tile({ product, slot, count, onPick, onUnpick }: {
  product: Product; slot: PromoSlot; count: number; onPick: () => void; onUnpick: () => void;
}) {
  const nav = useNav();
  const price = priceInfo(product);
  return (
    <div className={cx('promo-tile', count > 0 && 'is-picked')}>
      <button type="button" className="promo-tile-main" onClick={onPick} aria-pressed={count > 0}
        aria-label={`${count ? 'Scelto' : 'Scegli'}: ${[product.brand, product.name].filter(Boolean).join(' – ')}`}>
        <Media className="promo-tile-media" imgClassName="promo-tile-img" src={product.images[0] || ''}
          mode={product.imagesMode[0]} variant="card" alt=""
          placeholder={<div className="pcard-noimg"><Icon icon={faImage} /></div>} />
        <span className="promo-tile-brand">{product.brand}</span>
        <span className="promo-tile-name">{product.name}</span>
        <span className="promo-tile-price">
          {slot.free
            ? <><s>{product.price}</s> <strong>Omaggio</strong></>
            : <><strong>{price.label}</strong>{price.discount > 0 && <s>{product.price}</s>}</>}
        </span>
        <span className="promo-tile-check" aria-hidden="true">
          {count > 1 ? `×${count}` : <Icon icon={count ? faCheck : faPlus} />}
        </span>
      </button>
      <button type="button" className="promo-tile-info" onClick={() => nav.openProduct(product.uid)}
        aria-label={`Dettagli di ${product.name}`} title="Dettagli">
        <Icon icon={faCircleInfo} />
      </button>
      {slot.qty > 1 && count > 0 && (
        <button type="button" className="promo-tile-minus" onClick={onUnpick} aria-label={`Togli un ${product.name}`}>
          <Icon icon={faMinus} />
        </button>
      )}
    </div>
  );
}

/* ---------- Editor della promo (admin) ---------- */

const toInt = (value: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(value)) || 0));

function PromoEditor({ promo }: { promo: Promo }) {
  const admin = useAdmin()!;
  const nav = useNav();
  const catalog = useStore(catalogStore)!;
  const set = (patch: Partial<Promo>) => admin.updatePromo(promo.id, patch);
  const setSlot = (i: number, patch: Partial<PromoSlot>) =>
    set({ slots: promo.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const warnings = [
    ...promo.slots.flatMap((s, i) => (scopeIds(catalog, s).length ? [] : [`Scelta ${i + 1}: aggiungi almeno un prodotto o una categoria con dei prodotti.`])),
    ...(!promo.slots.length ? ['Aggiungi almeno una scelta.'] : []),
    ...(!promo.discount && !giftCount(promo) ? ['Imposta uno sconto o una scelta in omaggio: così la promo non fa risparmiare.'] : []),
    ...(promo.end && promo.end < today() ? ['La data di fine è passata: i clienti non la vedono più.'] : []),
  ];

  return (
    <>
      <SheetHead promo={promo} kicker="Modifica promozione" />
      <div className="promo-body promo-form">
        <div className={cx('promo-status', isPromoLive(promo) ? 'is-live' : 'is-off')}>
          {isPromoLive(promo)
            ? 'Visibile ai clienti in home, nelle categorie e nelle schede dei prodotti coinvolti.'
            : promo.draft ? 'Bozza: la vedi solo tu. Spunta «Pubblicata» quando è pronta, poi salva.' : 'Non visibile ai clienti.'}
          {warnings.map((w) => <div key={w} className="offer-warning">{w}</div>)}
        </div>

        <label className="promo-field">
          <span>Titolo</span>
          <input value={promo.title} onChange={(e) => set({ title: e.target.value })} placeholder="es. Natale in tavola" />
        </label>
        <label className="promo-field">
          <span>Descrizione (facoltativa)</span>
          <textarea rows={2} value={promo.desc} onChange={(e) => set({ desc: e.target.value })}
            placeholder="es. Un panettone artigianale e uno spumante siciliano: il regalo perfetto." />
        </label>
        <div className="promo-field-row">
          <label className="promo-field">
            <span>Sconto sul pack</span>
            <span className="promo-input-unit">
              <input type="number" min={0} max={99} inputMode="numeric" value={promo.discount || ''} placeholder="0"
                onChange={(e) => set({ discount: toInt(e.target.value, 0, 99) })} />
              <em>%</em>
            </span>
          </label>
          <label className="promo-field">
            <span>Ultimo giorno (facoltativo)</span>
            <input type="date" value={promo.end ?? ''} onChange={(e) => set({ end: e.target.value || undefined })} />
          </label>
          <label className="promo-check">
            <input type="checkbox" checked={!promo.draft} onChange={(e) => set({ draft: e.target.checked ? undefined : true })} />
            <span>Pubblicata</span>
          </label>
        </div>

        <h3 className="promo-form-title">Le scelte del cliente</h3>
        <p className="promo-form-note">
          Per ogni scelta il cliente prende i pezzi indicati tra i prodotti che aggiungi: uno per uno, oppure intere categorie
          e sottocategorie (i prodotti che aggiungerai dopo a quelle categorie entrano da soli nella promo).
          Lo sconto vale sui pezzi a pagamento; le scelte «in omaggio» sono gratis.
        </p>
        {promo.slots.map((slot, i) => (
          <section key={i} className={cx('promo-slot-edit', slot.free && 'is-free')}>
            <div className="promo-slot-head">
              <span className="promo-step-num">{slot.free ? <Icon icon={faGift} /> : i + 1}</span>
              <label className="promo-field grow">
                <span>Cosa sceglie</span>
                <input value={slot.label} placeholder="es. Panettone" onChange={(e) => setSlot(i, { label: e.target.value })} />
              </label>
              <label className="promo-field qty">
                <span>Pezzi</span>
                <input type="number" min={1} max={99} inputMode="numeric" value={slot.qty}
                  onChange={(e) => setSlot(i, { qty: toInt(e.target.value, 1, 99) })} />
              </label>
              <label className="promo-check">
                <input type="checkbox" checked={!!slot.free} onChange={(e) => setSlot(i, { free: e.target.checked || undefined })} />
                <span>In omaggio</span>
              </label>
              <AdminIconButton icon={faTrash} title="Elimina scelta" danger
                onClick={() => set({ slots: promo.slots.filter((_, j) => j !== i) })} />
            </div>
            <ScopePicker scope={slot} onChange={(patch) => setSlot(i, patch)} />
          </section>
        ))}
        <div className="sheet-admin-actions">
          <button type="button" className="sheet-admin-btn primary"
            onClick={() => set({ slots: [...promo.slots, { label: 'Prodotto', qty: 1, ids: [] }] })}>
            <Icon icon={faPlus} /><span>AGGIUNGI SCELTA</span>
          </button>
          <button type="button" className="sheet-admin-btn"
            onClick={() => set({ slots: [...promo.slots, { label: 'Omaggio', qty: 1, ids: [], free: true }] })}>
            <Icon icon={faGift} /><span>AGGIUNGI OMAGGIO</span>
          </button>
        </div>

        <h3 className="promo-form-title">Anteprima</h3>
        <div className="promo-grid is-single" inert><PromoCard promo={promo} catalog={catalog} /></div>

        <div className="sheet-admin-actions promo-form-end">
          <button type="button" className="sheet-admin-btn danger"
            onClick={async () => { if (await admin.deletePromo(promo.id)) nav.closePromo(); }}>
            <Icon icon={faTrash} /><span>ELIMINA PROMOZIONE</span>
          </button>
          <button type="button" className="sheet-admin-btn primary" onClick={nav.closePromo}>
            <Icon icon={faCheck} /><span>FATTO</span>
          </button>
        </div>
      </div>
    </>
  );
}

const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

const without = (ids: string[] | undefined, id: string) => {
  const next = (ids ?? []).filter((x) => x !== id);
  return next.length ? next : undefined;
};

/**
 * Gruppo di prodotti (scelte delle promo, pack su piu' prodotti): prodotti uno per uno e categorie o
 * sottocategorie intere. Le categorie restano collegate, quindi comprendono anche i prodotti aggiunti dopo.
 */
export function ScopePicker({ scope, onChange }: { scope: Scope; onChange: (patch: Partial<Scope>) => void }) {
  const catalog = useStore(catalogStore);
  if (!catalog) return null;
  const count = scopeIds(catalog, scope).length;
  const inSub = (m: Macro, subId: string) => m.products.filter((p) => p.categoryId === subId).length;
  const macros = catalog.macros.filter((m) => scope.macros?.includes(m.id));
  const subs = catalog.macros.flatMap((m) => m.subcategories.filter((s) => scope.subs?.includes(s.id)).map((sub) => ({ m, sub })));
  return (
    <div className="scope-picker">
      {(macros.length > 0 || subs.length > 0) && (
        <div className="picked-list">
          {macros.map((m) => (
            <span key={m.id} className="picked-chip is-group">
              <span><Icon icon={faLayerGroup} /> Tutta la categoria {m.name} <small>({m.products.length})</small></span>
              <button type="button" onClick={() => onChange({ macros: without(scope.macros, m.id) })} aria-label={`Togli la categoria ${m.name}`}>
                <Icon icon={faXmark} />
              </button>
            </span>
          ))}
          {subs.map(({ m, sub }) => (
            <span key={sub.id} className="picked-chip is-group">
              <span><Icon icon={faFolder} /> {sub.name} <small>· {m.name} ({inSub(m, sub.id)})</small></span>
              <button type="button" onClick={() => onChange({ subs: without(scope.subs, sub.id) })} aria-label={`Togli la sottocategoria ${sub.name}`}>
                <Icon icon={faXmark} />
              </button>
            </span>
          ))}
        </div>
      )}
      <PickedList ids={scope.ids} onChange={(ids) => onChange({ ids })} />
      <ProductPicker selected={scope.ids} onToggle={(id) => onChange({ ids: toggle(scope.ids, id) })} />
      <label className="promo-subpick">
        <span className="sr-only">Aggiungi una categoria o sottocategoria intera</span>
        <select value="" onChange={(e) => {
          const [kind, id] = e.target.value.split('|');
          if (kind === 'm') onChange({ macros: [...(scope.macros ?? []), id] });
          if (kind === 's') onChange({ subs: [...(scope.subs ?? []), id] });
        }}>
          <option value="">+ Aggiungi una categoria o sottocategoria intera…</option>
          {catalog.macros.map((m) => (
            <optgroup key={m.id} label={m.name}>
              {!scope.macros?.includes(m.id) && <option value={`m|${m.id}`}>Tutta la categoria ({m.products.length})</option>}
              {!scope.macros?.includes(m.id) && m.subcategories.filter((s) => !scope.subs?.includes(s.id)).map((s) => (
                <option key={s.id} value={`s|${s.id}`}>{s.name} ({inSub(m, s.id)})</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="scope-count">In tutto: {count === 1 ? '1 prodotto' : `${count} prodotti`}</p>
    </div>
  );
}

/* ---------- Selettori di prodotti (admin: promo e consigliati) ---------- */

/** Prodotti scelti, nell'ordine; la × li toglie. */
export function PickedList({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const catalog = useStore(catalogStore);
  if (!catalog || !ids.length) return null;
  const index = indexCatalog(catalog);
  const refs = refsOf(index, ids);
  return (
    <div className="picked-list">
      {refs.map(({ product }) => (
        <span key={product.id} className="picked-chip">
          <span>{product.name}{product.brand && <small> · {product.brand}</small>}</span>
          <button type="button" onClick={() => onChange(ids.filter((id) => id !== product.id))} aria-label={`Togli ${product.name}`}>
            <Icon icon={faXmark} />
          </button>
        </span>
      ))}
      {refs.length > 3 && (
        <button type="button" className="picked-clear" onClick={() => onChange([])}>Togli tutti</button>
      )}
    </div>
  );
}

/** Ricerca nel catalogo: tocca un risultato per aggiungerlo o toglierlo. */
export function ProductPicker({ selected, onToggle, exclude }: { selected: string[]; onToggle: (id: string) => void; exclude?: string }) {
  const [query, setQuery] = useState('');
  const catalog = useStore(catalogStore);
  const results = catalog && query.trim()
    ? searchCatalog(indexCatalog(catalog), query).flatMap((g) => g.items).filter((r) => r.product.id !== exclude).slice(0, 12)
    : [];
  return (
    <div className="picker">
      <label className="picker-search">
        <Icon icon={faMagnifyingGlass} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca un prodotto da aggiungere…"
          aria-label="Cerca un prodotto da aggiungere" />
      </label>
      {query.trim() !== '' && (
        <div className="picker-results">
          {results.length ? results.map(({ product, macro }) => {
            const on = selected.includes(product.id);
            return (
              <button key={product.uid} type="button" className={cx('picker-row', on && 'is-on')} aria-pressed={on}
                onClick={() => onToggle(product.id)}>
                <Media className="picker-media" imgClassName="picker-img" src={product.images[0] || ''} mode={product.imagesMode[0]}
                  variant="search" alt="" placeholder={<span className="mini-no-img"><Icon icon={faImage} /></span>} />
                <span className="picker-text">
                  <strong>{product.name}</strong>
                  <small>{[product.brand, macro.name, priceInfo(product).label].filter(Boolean).join(' · ')}</small>
                </span>
                <Icon icon={on ? faCheck : faPlus} />
              </button>
            );
          }) : <div className="picker-none">Nessun prodotto trovato</div>}
        </div>
      )}
    </div>
  );
}
