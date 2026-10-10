// Scheda prodotto. Desktop: foto a sinistra, informazioni a destra. Mobile: foto in alto e contenuti sotto.
// Ordine delle informazioni: identita' e prezzo, dati chiave, confezione, sezioni richiudibili, correlati;
// il pulsante "Aggiungi" resta sempre visibile in basso.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import {
  faArrowRight, faBagShopping, faBoxArchive, faChevronDown, faChevronLeft, faChevronRight, faCopy, faEraser, faExpand,
  faGripVertical, faMagnifyingGlassPlus, faPaste, faPlus, faShareNodes, faTrash, faTruckFast, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Product } from '../types';
import { indexCatalog, isBlankHtml, keyFacts, type ProductRef } from '../lib/catalog';
import { useAdmin } from '../lib/admin';
import { cx, useEscape, useScrollLock } from '../lib/hooks';
import { addToSelection, markViewed, selectionStore } from '../lib/personal';
import { formatPrice, lineQuote, packOffers, priceInfo } from '../lib/pricing';
import { useNav } from '../lib/router';
import { moveItem, useSortable } from '../lib/sortable';
import { catalogStore, useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { OfferBadges } from './Catalog';
import { Editable, RichText } from './Editable';
import { ProductRail } from './Home';
import { Icon } from './Icon';
import { ImageViewer } from './ImageViewer';
import { OffersEditor } from './Offers';
import { packNote, Stepper } from './Selection';
import { AdminIconButton, Media } from './ui';

export function ProductSheet({ entry }: { entry?: ProductRef }) {
  const nav = useNav();
  const admin = useAdmin();
  const open = !!entry;
  // durante l'animazione di chiusura resta visibile l'ultimo prodotto
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);
  const [viewer, setViewer] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useScrollLock(open);
  useEscape(open && viewer === null, nav.closeProduct);

  // focus nella scheda all'apertura, ritorno all'elemento di partenza alla chiusura
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) setViewer(null);
  }, [open]);

  // "visti di recente" (solo per i clienti)
  const viewedUid = entry?.product.uid;
  useEffect(() => {
    const catalog = catalogStore.get();
    const slug = viewedUid && catalog && indexCatalog(catalog).productSlug.get(viewedUid);
    if (slug && !admin) markViewed(slug);
  }, [viewedUid, admin]);

  const product = shown?.product;
  return (
    <>
      <div className={cx('sheet-overlay', open && 'open')} onClick={nav.closeProduct}>
        <div ref={sheetRef} className={cx('sheet pd', open && 'open')} role="dialog" aria-modal="true" aria-label={product?.name}
          tabIndex={-1} inert={!open} onClick={(e) => e.stopPropagation()}>
          {product && <ProductDetail key={product.uid} product={product} onOpenViewer={setViewer} />}
        </div>
      </div>
      {product && viewer !== null && (
        <ImageViewer
          images={product.images.filter(Boolean)}
          modes={product.images.map((_, i) => product.imagesMode[i]).filter((_, i) => product.images[i])}
          start={viewer}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

function ProductDetail({ product, onOpenViewer }: { product: Product; onOpenViewer: (index: number) => void }) {
  const nav = useNav();
  const admin = useAdmin();
  const [qty, setQty] = useState(1);
  // mobile: superata la foto, i pulsanti diventano una barra con il nome del prodotto
  const [stuck, setStuck] = useState(false);
  const price = priceInfo(product);
  const facts = keyFacts(product.tech);
  const index = indexCatalog(catalogStore.get()!);
  const slug = index.productSlug.get(product.uid) ?? '';
  const update = (patch: Partial<Product>) => admin?.updateProduct(product.uid, patch);
  const edit = (field: 'brand' | 'name' | 'infoLine' | 'price') => (admin ? (value: string) => update({ [field]: value }) : undefined);

  // dopo un caricamento la galleria si posiziona sulla nuova foto
  const imageCount = useRef(product.images.length);
  const grew = product.images.length > imageCount.current;
  useEffect(() => { imageCount.current = product.images.length; });

  // prima la stessa sottocategoria, poi il resto della categoria
  const related = useMemo(() => {
    const macro = index.byUid.get(product.uid)?.macro;
    const others = index.entries.filter((e) => e.macro === macro && e.product.uid !== product.uid);
    return [...others.filter((e) => e.product.categoryId === product.categoryId),
      ...others.filter((e) => e.product.categoryId !== product.categoryId)].slice(0, 12);
  }, [index, product.uid, product.categoryId]);

  // nel sito pubblico le sezioni vuote (o con il testo segnaposto) non vengono mostrate
  const hasDesc = !!admin || !isBlankHtml(product.desc);
  const hasPair = !!admin || !isBlankHtml(product.pair);
  const hasTech = !!admin || product.tech.length > 0;

  const canShare = !admin && (typeof navigator.share === 'function' || !!navigator.clipboard);
  const share = async () => {
    const url = new URL(nav.productHref(product.uid), location.href).href;
    const title = [product.brand, product.name].filter(Boolean).join(' – ');
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copiato negli appunti');
      }
    } catch { /* condivisione annullata */ }
  };

  return (
    <div className={cx('pd-scroll', stuck && 'is-stuck')}
      onScroll={(e) => setStuck(e.currentTarget.scrollTop > (e.currentTarget.firstElementChild as HTMLElement).offsetHeight - 70)}>
      <Gallery key={product.images.length} product={product} showLast={grew} onOpen={onOpenViewer} />

      <div className="pd-side">
        <div className="pd-actions">
          <span className="pd-actions-title" aria-hidden="true">{product.name}</span>
          {canShare && (
            <button type="button" className="pd-icon-btn" onClick={share} aria-label="Condividi prodotto" title="Condividi">
              <Icon icon={faShareNodes} />
            </button>
          )}
          <button type="button" className="pd-icon-btn" onClick={nav.closeProduct} aria-label="Chiudi scheda" title="Chiudi">
            <Icon icon={faXmark} />
          </button>
        </div>

        <div className="pd-info">
          <header className="pd-head">
            <Editable className="pd-brand" value={product.brand} onChange={edit('brand')} singleLine />
            <Editable className="pd-title" role="heading" aria-level={2} value={product.name} onChange={edit('name')} singleLine />
            {(product.infoLine || admin) && (
              <Editable className="pd-subtitle editable-placeholder" value={product.infoLine} onChange={edit('infoLine')}
                placeholder="Inserisci un dettaglio rapido" singleLine />
            )}
            <div className="pd-price-row">
              {/* in admin si modifica il prezzo pieno; lo sconto si imposta nel riquadro offerte */}
              {!admin && price.discount > 0 && <s className="pd-price-old">{product.price}</s>}
              <Editable className="pd-price" value={admin ? product.price : price.label} onChange={edit('price')} singleLine />
              {price.discount > 0 && <span className="sale-badge">-{price.discount}%</span>}
            </div>
            <div className="pd-ship"><Icon icon={faTruckFast} /> Spedizione gratuita</div>
          </header>

          {facts.length > 0 && (
            <dl className="pd-facts">
              {facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
            </dl>
          )}

          {admin ? <OffersEditor product={product} /> : <PackPicker product={product} qty={qty} onSelect={setQty} />}
          {!admin && slug && <InSelection slug={slug} />}

          {hasDesc && (
            <Block title="Descrizione" open>
              <RichText value={product.desc} onChange={admin ? (desc) => update({ desc }) : undefined} />
            </Block>
          )}
          {hasTech && (
            <Block title="Scheda tecnica" meta={`${product.tech.length} voci`} open={!!admin || !hasDesc}>
              <TechTable product={product} />
              {admin && (
                <div className="sheet-admin-actions">
                  <button type="button" className="sheet-admin-btn primary"
                    onClick={() => update({ tech: [...product.tech, { k: 'Nuovo Campo', v: 'Valore' }] })}>
                    <Icon icon={faPlus} /><span>AGGIUNGI RIGA</span>
                  </button>
                  <button type="button" className="sheet-admin-btn" onClick={() => admin.copyTech(product.uid)}>
                    <Icon icon={faCopy} /><span>COPIA SCHEDA</span>
                  </button>
                  <button type="button" className="sheet-admin-btn" onClick={() => admin.pasteTech(product.uid)}>
                    <Icon icon={faPaste} /><span>INCOLLA SCHEDA</span>
                  </button>
                  <button type="button" className="sheet-admin-btn" onClick={() => admin.copyProduct(product.uid)}>
                    <Icon icon={faBoxArchive} /><span>COPIA PRODOTTO</span>
                  </button>
                </div>
              )}
            </Block>
          )}
          {hasPair && (
            <Block title="Abbinamenti" open={!!admin}>
              <RichText value={product.pair} onChange={admin ? (pair) => update({ pair }) : undefined} />
            </Block>
          )}

          {!admin && related.length > 0 && (
            <div className="pd-related">
              <ProductRail kicker="Dalla stessa selezione" title="Potrebbero piacerti" items={related} compact />
            </div>
          )}
        </div>

        {!admin && slug && <BuyBar product={product} slug={slug} qty={qty} onQty={setQty} />}
      </div>
    </div>
  );
}

/** Sezione richiudibile (elemento nativo <details>: tastiera e screen reader gia' gestiti). */
function Block({ title, meta, open, children }: { title: string; meta?: string; open: boolean; children: ReactNode }) {
  return (
    <details className="pd-block" open={open}>
      <summary>
        <span className="pd-block-title">{title}</span>
        {meta && <span className="pd-block-meta">{meta}</span>}
        <Icon icon={faChevronDown} />
      </summary>
      <div className="pd-block-body">{children}</div>
    </details>
  );
}

/* ---------- Acquisto ---------- */

function PackPicker({ product, qty, onSelect }: { product: Product; qty: number; onSelect: (qty: number) => void }) {
  const offers = packOffers(product);
  if (!offers.length) return null;
  const unit = priceInfo(product).final;
  const options = [
    { qty: 1, discount: 0, total: unit, perUnit: null as number | null },
    ...offers.map((o) => ({ qty: o.qty, discount: o.discount, total: o.total, perUnit: o.perUnit })),
  ];
  return (
    <div className="pd-packs-wrap">
      <div className="pd-label">Scegli la confezione</div>
      <div className="pd-packs" role="radiogroup" aria-label="Confezione">
        {options.map((o, i) => (
          <button key={i} type="button" role="radio" aria-checked={qty === o.qty}
            className={cx('pd-pack', qty === o.qty && 'active')} onClick={() => onSelect(o.qty)}>
            <span className="pd-pack-qty">{o.qty === 1 ? '1 pezzo' : `${o.qty} pezzi`}</span>
            <strong>{o.total !== null ? formatPrice(o.total, product.price) : product.price}</strong>
            <small>{o.perUnit !== null ? `${formatPrice(o.perUnit, product.price)} cad.` : 'singolo'}</small>
            {o.discount > 0 && <span className="sale-badge">-{o.discount}%</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function InSelection({ slug }: { slug: string }) {
  const nav = useNav();
  const qty = useStore(selectionStore)[slug] ?? 0;
  if (!qty) return null;
  return (
    <button type="button" className="pd-in-selection" onClick={nav.openSelection}>
      <Icon icon={faBagShopping} /> Nella tua selezione: <strong>{qty} pz</strong>
      <span>Apri <Icon icon={faArrowRight} /></span>
    </button>
  );
}

function BuyBar({ product, slug, qty, onQty }: { product: Product; slug: string; qty: number; onQty: (qty: number) => void }) {
  const quote = lineQuote(product, qty);
  const saving = quote.list !== null && quote.total !== null ? quote.list - quote.total : 0;
  const add = () => {
    addToSelection(slug, qty);
    toast(`Aggiunto alla selezione: ${qty} × ${product.name || 'prodotto'}`);
    onQty(1);
  };
  return (
    <div className="pd-cta">
      {saving > 0.004 && (
        <div className="pd-cta-saving">
          Risparmi {formatPrice(saving, product.price)}{quote.packs.length ? ` · ${packNote(quote)}` : ''}
        </div>
      )}
      <div className="pd-cta-row">
        <Stepper value={qty} onChange={onQty} />
        <button type="button" className="buy-btn" onClick={add}>
          <Icon icon={faBagShopping} />
          <span>Aggiungi</span>
          {quote.total !== null && <strong>{formatPrice(quote.total, product.price)}</strong>}
        </button>
      </div>
    </div>
  );
}

/* ---------- Galleria ---------- */

function Gallery({ product, showLast, onOpen }: { product: Product; showLast: boolean; onOpen: (i: number) => void }) {
  const admin = useAdmin();
  const trackRef = useRef<HTMLDivElement>(null);
  const images = product.images.map((src, i) => ({ src, mode: product.imagesMode[i], index: i })).filter((img) => img.src);
  const [active, setActive] = useState(showLast ? Math.max(0, images.length - 1) : 0);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track && active) track.scrollTo({ left: track.offsetWidth * active, behavior: 'instant' });
  }, []); // solo al montaggio

  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const track = trackRef.current;
      if (track) setActive(Math.max(0, Math.round(track.scrollLeft / (track.offsetWidth || 1))));
    });
  };
  const goTo = (i: number) => {
    const track = trackRef.current;
    if (track) track.scrollTo({ left: track.offsetWidth * Math.max(0, Math.min(images.length - 1, i)), behavior: 'smooth' });
  };
  const current = images[active];

  return (
    <div className="pd-media">
      <div className="pd-track" ref={trackRef} onScroll={onScroll}>
        {images.length ? images.map((img, i) => (
          <Media key={i} className="pd-slide" imgClassName="pd-img" src={img.src} mode={img.mode} variant="gallery"
            eager={i === 0} alt={`${product.name} – immagine ${i + 1}`} onImageClick={() => onOpen(i)} />
        )) : (
          <div className="pd-slide pd-slide-empty"><Icon icon={faImage} /><span>Nessuna foto</span></div>
        )}
      </div>
      <OfferBadges product={product} className="pd-badges" />
      {images.length > 1 && (
        <>
          <button type="button" className="pd-nav prev" disabled={active === 0} onClick={() => goTo(active - 1)}
            aria-label="Immagine precedente"><Icon icon={faChevronLeft} /></button>
          <button type="button" className="pd-nav next" disabled={active >= images.length - 1} onClick={() => goTo(active + 1)}
            aria-label="Immagine successiva"><Icon icon={faChevronRight} /></button>
          <div className="pd-dots">
            {images.map((_, i) => (
              <button key={i} type="button" className={cx('pd-dot', i === active && 'active')} aria-label={`Immagine ${i + 1}`}
                onClick={() => goTo(i)} />
            ))}
          </div>
        </>
      )}
      {current && (
        <button type="button" className="pd-zoom" onClick={() => onOpen(active)} aria-label="Ingrandisci immagine" title="Ingrandisci">
          <Icon icon={faMagnifyingGlassPlus} />
        </button>
      )}
      {admin && (
        <div className="upload-overlay">
          <AdminIconButton className="hero-admin-btn add" icon={faPlus} title="Aggiungi foto" onClick={() => admin.addImages(product.uid)} />
          {current && (
            <>
              <AdminIconButton className="hero-admin-btn add" icon={current.mode === 'full' ? faImage : faExpand}
                title={current.mode === 'full' ? 'Mostra come etichetta' : 'Mostra a tutto schermo'}
                onClick={() => admin.toggleImageMode(product.uid, current.index)} />
              <AdminIconButton className="hero-admin-btn remove" icon={faTrash} title="Elimina questa foto"
                onClick={() => admin.removeImage(product.uid, current.index)} />
              <AdminIconButton className="hero-admin-btn remove" icon={faEraser} title="Elimina tutte le foto"
                onClick={() => admin.clearImages(product.uid)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Scheda tecnica ---------- */

function TechTable({ product }: { product: Product }) {
  const admin = useAdmin();
  const ref = useRef<HTMLDivElement>(null);
  const setTech = (tech: Product['tech']) => admin?.updateProduct(product.uid, { tech });
  useSortable(ref, {
    enabled: !!admin,
    item: '.tech-row',
    handle: '.tech-drag-handle',
    onMove: (from, to) => setTech(moveItem(product.tech, from, to)),
  });
  const editCell = (i: number, key: 'k' | 'v') =>
    admin ? (value: string) => setTech(product.tech.map((row, j) => (j === i ? { ...row, [key]: value } : row))) : undefined;

  return (
    <div className={cx('tech-table', admin && 'is-editable')} ref={ref}>
      {product.tech.map((row, i) => (
        <div className="tech-row" key={i}>
          {admin && <div className="tech-drag-handle" title="Trascina per riordinare"><Icon icon={faGripVertical} /></div>}
          <Editable className="tech-key" value={row.k} onChange={editCell(i, 'k')} singleLine />
          <Editable className="tech-val" value={row.v} onChange={editCell(i, 'v')} />
          {admin && (
            <button type="button" className="tech-delete" title="Elimina riga" aria-label="Elimina riga"
              onClick={() => setTech(product.tech.filter((_, j) => j !== i))}>
              <Icon icon={faXmark} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
