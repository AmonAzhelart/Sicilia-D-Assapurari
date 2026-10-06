import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import {
  faBoxArchive, faChevronLeft, faChevronRight, faClipboardList, faCopy, faExpand, faFileLines, faPaste, faPlus,
  faShareNodes, faTrash, faTruckFast, faUtensils, faXmark, faGripVertical, faEraser,
} from '@fortawesome/free-solid-svg-icons';
import type { Product } from '../types';
import { isBlankHtml, type ProductRef } from '../lib/catalog';
import { useAdmin } from '../lib/admin';
import { cx, useEscape, useScrollLock } from '../lib/hooks';
import { useNav } from '../lib/router';
import { moveItem, useSortable } from '../lib/sortable';
import { toast } from '../lib/toast';
import { Editable, RichText } from './Editable';
import { Icon } from './Icon';
import { ImageViewer } from './ImageViewer';
import { AdminIconButton, Media } from './ui';

type Tab = 'tech' | 'desc' | 'pair';
const TABS: Array<{ id: Tab; title: string; label: string; icon: typeof faClipboardList }> = [
  { id: 'tech', title: 'Scheda Tecnica', label: 'Tecnica', icon: faClipboardList },
  { id: 'desc', title: 'Descrizione', label: 'Info', icon: faFileLines },
  { id: 'pair', title: 'Abbinamenti', label: 'Abbina', icon: faUtensils },
];

export function ProductSheet({ entry }: { entry?: ProductRef }) {
  const nav = useNav();
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

  const product = shown?.product;
  return (
    <>
      <div className={cx('sheet-overlay', open && 'open')} onClick={nav.closeProduct}>
        <div ref={sheetRef} className={cx('sheet', open && 'open')} role="dialog" aria-modal="true" aria-label={product?.name}
          tabIndex={-1} inert={!open} onClick={(e) => e.stopPropagation()}>
          <button type="button" className="close-desktop" onClick={nav.closeProduct} aria-label="Chiudi scheda"><Icon icon={faXmark} /></button>
          <button type="button" className="close-mobile" onClick={nav.closeProduct} aria-label="Chiudi scheda"><Icon icon={faXmark} /></button>
          {product && <SheetContent key={product.uid} product={product} onOpenViewer={setViewer} />}
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

function SheetContent({ product, onOpenViewer }: { product: Product; onOpenViewer: (index: number) => void }) {
  const nav = useNav();
  const admin = useAdmin();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState(false);
  // dopo un caricamento la galleria si posiziona sulla nuova foto
  const imageCount = useRef(product.images.length);
  const grew = product.images.length > imageCount.current;
  useEffect(() => { imageCount.current = product.images.length; });
  const update = (patch: Partial<Product>) => admin?.updateProduct(product.uid, patch);
  const edit = (field: 'brand' | 'name' | 'infoLine' | 'price') => (admin ? (value: string) => update({ [field]: value }) : undefined);

  // nel sito pubblico le sezioni vuote (o con il testo segnaposto) non vengono mostrate
  const visible = TABS.filter(({ id }) => admin || (id === 'tech' ? product.tech.length > 0 : !isBlankHtml(product[id])));
  const [tab, setTab] = useState<Tab>(visible[0]?.id ?? 'tech');
  const switchTab = (id: Tab) => {
    setTab(id);
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
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
    <>
      <div className={cx('sheet-header-mobile', product.infoLine.trim() && 'has-subtitle', photo && 'has-photo-bg')}>
        <Gallery key={product.images.length} product={product} showLast={grew} onPhoto={setPhoto} onOpen={onOpenViewer} />
        <div className={cx('hero-info-overlay', canShare && 'has-share')}>
          <Editable className="p-brand" value={product.brand} onChange={edit('brand')} singleLine />
          <Editable className="p-title" role="heading" aria-level={2} value={product.name} onChange={edit('name')} singleLine />
          {(product.infoLine || admin) && (
            <Editable className="p-subtitle editable-placeholder" value={product.infoLine} onChange={edit('infoLine')}
              placeholder="Inserisci un dettaglio rapido" singleLine />
          )}
          <div className="p-price-row">
            <Editable className="p-price" value={product.price} onChange={edit('price')} singleLine />
            <div className="shipping-free-badge"><Icon icon={faTruckFast} /><span>Gratuita</span></div>
          </div>
        </div>
      </div>
      {canShare && (
        <button type="button" className="share-btn" onClick={share} aria-label="Condividi prodotto" title="Condividi">
          <Icon icon={faShareNodes} />
        </button>
      )}

      <div className="sheet-body-mobile" ref={bodyRef}>
        <div className="p-content">
          {visible.map(({ id, title }) => (
            <div key={id} className={cx('tab-content', tab === id && 'active')} id={`tab-${id}`} role="tabpanel">
              <h4 className="sheet-section-title">{title}</h4>
              {id === 'tech' ? (
                <>
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
                </>
              ) : (
                <RichText value={product[id]} onChange={admin ? (html) => update({ [id]: html }) : undefined} />
              )}
            </div>
          ))}
        </div>
      </div>

      {visible.length > 1 && (
        <nav className="tabs-nav" role="tablist" aria-label="Sezioni scheda">
          {visible.map(({ id, label, icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`tab-${id}`}
              className={cx('tab-link', tab === id && 'active')} onClick={() => switchTab(id)}>
              <Icon icon={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

/* ---------- Galleria ---------- */

function Gallery({ product, showLast, onPhoto, onOpen }: {
  product: Product; showLast: boolean; onPhoto: (photo: boolean) => void; onOpen: (i: number) => void;
}) {
  const admin = useAdmin();
  const trackRef = useRef<HTMLDivElement>(null);
  const images = product.images.map((src, i) => ({ src, mode: product.imagesMode[i], index: i })).filter((img) => img.src);
  const [active, setActive] = useState(showLast ? Math.max(0, images.length - 1) : 0);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track && active) track.scrollTo({ left: track.offsetWidth * active, behavior: 'instant' });
  }, []); // solo al montaggio
  const [photos, setPhotos] = useState<boolean[]>([]);
  const photo = !!photos[active];
  const frame = useRef(0);

  useEffect(() => onPhoto(photo), [photo, onPhoto]);

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
  const setPhotoAt = useCallback((i: number, value: boolean) => {
    setPhotos((prev) => (prev[i] === value ? prev : Object.assign([...prev], { [i]: value })));
  }, []);
  const current = images[active];

  return (
    <>
      {images.length > 1 && (
        <>
          <button type="button" className="gallery-nav prev" style={{ opacity: active === 0 ? 0.3 : 1 }}
            onClick={() => goTo(active - 1)} aria-label="Immagine precedente"><Icon icon={faChevronLeft} /></button>
          <button type="button" className="gallery-nav next" style={{ opacity: active >= images.length - 1 ? 0.3 : 1 }}
            onClick={() => goTo(active + 1)} aria-label="Immagine successiva"><Icon icon={faChevronRight} /></button>
        </>
      )}
      <div className={cx('p-track', photo && 'has-photo-bg')} ref={trackRef} onScroll={onScroll}>
        {images.length ? images.map((img, i) => (
          <Media key={i} className="p-slide" imgClassName="p-img zoomable" src={img.src} mode={img.mode} variant="gallery"
            eager={i === 0} alt={`${product.name} – immagine ${i + 1}`} onSurface={(value) => setPhotoAt(i, value)}
            onImageClick={() => onOpen(i)} />
        )) : (
          <div className="p-slide p-slide-empty"><Icon icon={faImage} /><span>{admin ? 'NO FOTO' : 'Nessuna foto'}</span></div>
        )}
      </div>
      <button type="button" className={cx('hero-image-peek', photo && 'has-photo-bg')} disabled={!images.length}
        onClick={() => onOpen(active)} aria-label="Apri immagine prodotto" />
      {images.length > 1 && (
        <div className="p-dots">
          {images.map((_, i) => (
            <button key={i} type="button" className={cx('dot', i === active && 'active')} aria-label={`Immagine ${i + 1}`}
              onClick={() => goTo(i)} />
          ))}
        </div>
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
    </>
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
