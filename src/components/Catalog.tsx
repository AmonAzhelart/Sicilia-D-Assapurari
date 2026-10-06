import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import {
  faArrowDown, faArrowRight, faArrowRightArrowLeft, faArrowUp, faCamera, faCheck, faCopy, faGripVertical, faPaste, faPlus,
  faRightLeft, faTruckFast, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Catalog, Macro, Product, Sub } from '../types';
import { useAdmin } from '../lib/admin';
import { useNav } from '../lib/router';
import { useSortable } from '../lib/sortable';
import { catalogStore } from '../lib/store';
import { Editable } from './Editable';
import { Icon } from './Icon';
import { AdminIconButton, LinkBox, Media } from './ui';

/* ---------- Home: griglia delle macro categorie ---------- */

export function CategoryHome({ macros }: { macros: Macro[] }) {
  const nav = useNav();
  const admin = useAdmin();
  return (
    <div className="cat-home">
      <div className="cat-home-grid">
        {macros.map((m, i) => (
          <LinkBox key={m.id} className="cat-home-card" href={nav.href({ macroId: m.id })} onOpen={() => nav.selectMacro(m.id)}
            asDiv={!!admin} label={m.name}>
            {m.bgImage
              ? <img className="cat-home-card-bg" src={m.bgImage} alt="" loading={i < 2 ? 'eager' : 'lazy'} decoding="async"
                  fetchPriority={i < 2 ? 'high' : 'auto'} />
              : <><div className="cat-home-no-img"><Icon icon={faImage} /></div><div className="cat-home-card-bg" /></>}
            <div className="cat-home-card-overlay" />
            <div className="cat-home-card-body">
              <div className="cat-home-card-name">{m.name}</div>
              <div className="cat-home-card-meta">Esplora</div>
            </div>
            <div className="cat-home-card-arrow"><Icon icon={faArrowRight} /></div>
            {admin && (
              <AdminIconButton className="cat-home-bg-btn" icon={faCamera} title="Cambia immagine di sfondo"
                onClick={() => admin.pickMacroImage(m.id, 'bgImage')} />
            )}
          </LinkBox>
        ))}
      </div>
    </div>
  );
}

/* ---------- Hero di categoria ---------- */

export function Hero({ macro }: { macro: Macro }) {
  const admin = useAdmin();
  const edit = (field: 'heroTag' | 'heroTitle' | 'heroDesc') =>
    admin ? (value: string) => admin.setMacro(macro.id, { [field]: value.trim() }) : undefined;
  return (
    <div className="hero">
      {macro.heroImage && <img className="hero-img" src={macro.heroImage} alt="" decoding="async" fetchPriority="high" />}
      <div className="hero-overlay" />
      <div className="hero-content">
        <Editable className="hero-tag" value={macro.heroTag || macro.name.toUpperCase()} onChange={edit('heroTag')} singleLine />
        <Editable className="hero-title" role="heading" aria-level={1} value={macro.heroTitle || macro.name}
          onChange={edit('heroTitle')} singleLine />
        {(macro.heroDesc || admin) && (
          <Editable as="p" className="hero-desc" value={macro.heroDesc} onChange={edit('heroDesc')} placeholder="Descrizione" />
        )}
        {admin && (
          <button type="button" className="admin-pill" onClick={() => admin.pickMacroImage(macro.id, 'heroImage')}
            style={{ position: 'relative', top: 'auto', right: 'auto', marginTop: 15, display: 'inline-flex', border: 'none', color: 'var(--primary)' }}>
            <Icon icon={faCamera} /> CAMBIA HERO
          </button>
        )}
      </div>
    </div>
  );
}

export function ShippingBanner() {
  return (
    <div className="shipping-banner-wrap">
      <div className="shipping-banner">
        <div className="shipping-banner-inner">
          <div className="shipping-banner-badge" aria-hidden="true"><Icon icon={faTruckFast} /></div>
          <div className="shipping-banner-copy">
            <span className="shipping-banner-title">Spedizione gratuita su tutti i prodotti</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Sottocategoria con griglia prodotti ---------- */

export function Section({ macro, sub }: { macro: Macro; sub: Sub }) {
  const nav = useNav();
  const admin = useAdmin();
  const gridRef = useRef<HTMLDivElement>(null);
  const products = useMemo(() => macro.products.filter((p) => p.categoryId === sub.id), [macro.products, sub.id]);

  useSortable(gridRef, {
    enabled: !!admin,
    item: '.card',
    handle: '.card-drag',
    onMove: (from, to) => admin?.reorderProduct(products[from].uid, products[to].uid),
  });

  const add = (uid: string | null) => {
    if (uid) nav.openProduct(uid);
  };

  return (
    <section className="section-pane" aria-labelledby={`sec-${sub.id}`}>
      <div className="section-header">
        <div className="section-heading">
          <div className="sec-kicker">Sottocategoria</div>
          <div className="sec-title" id={`sec-${sub.id}`} role="heading" aria-level={2}>{sub.name}</div>
          <div className="sec-subtitle">Selezione attuale del catalogo</div>
        </div>
        {admin && (
          <div className="section-admin-tools">
            <AdminIconButton icon={faArrowUp} title="Sposta sottocategoria in alto" onClick={() => admin.moveSub(macro.id, sub.id, -1)} />
            <AdminIconButton icon={faArrowDown} title="Sposta sottocategoria in basso" onClick={() => admin.moveSub(macro.id, sub.id, 1)} />
            <AdminIconButton icon={faRightLeft} title="Sposta sottocategoria in un'altra macro categoria"
              onClick={async () => {
                const target = await admin.moveSubToMacro(macro.id, sub.id);
                if (target) nav.selectMacro(target);
              }} />
            <AdminIconButton icon={faXmark} title="Elimina sottocategoria" danger
              onClick={async () => { if (await admin.deleteSub(macro.id, sub.id)) nav.selectMacro(macro.id); }} />
          </div>
        )}
      </div>

      <div className="grid" ref={gridRef}>
        {products.length
          ? products.map((p, i) => <ProductCard key={p.uid} product={p} eager={i < 2} />)
          : (
            <div className="category-empty">
              <div className="category-empty-title">Nessun prodotto ancora disponibile</div>
              <div className="category-empty-text">La categoria "{sub.name}" non contiene ancora prodotti visibili in questo momento.</div>
            </div>
          )}
      </div>

      {admin && (
        <div className="section-add">
          <div className="section-product-actions">
            <button type="button" className="add-product-btn" onClick={() => add(admin.addProduct(macro.id, sub.id))}>
              <Icon icon={faPlus} style={{ fontSize: '1.1rem' }} /><span>AGGIUNGI PRODOTTO</span>
            </button>
            <button type="button" className="add-product-btn paste-product-btn" onClick={() => add(admin.pasteProduct(macro.id, sub.id))}>
              <Icon icon={faPaste} style={{ fontSize: '1.1rem' }} /><span>INCOLLA PRODOTTO</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Card prodotto ---------- */

export const ProductCard = memo(function ProductCard({ product, eager }: { product: Product; eager: boolean }) {
  const nav = useNav();
  const admin = useAdmin();
  const label = [product.brand, product.name, product.price].filter(Boolean).join(' – ');
  return (
    <LinkBox className="card visible" href={nav.productHref(product.uid)} onOpen={() => nav.openProduct(product.uid)}
      asDiv={!!admin} label={label}>
      <Media className="card-media" imgClassName="card-img" src={product.images[0] || ''} mode={product.imagesMode[0]}
        variant="card" eager={eager} alt={product.name}
        placeholder={<div className="card-no-img" style={{ display: 'flex' }}><Icon icon={faImage} style={{ fontSize: '2rem', color: '#ddd' }} /></div>} />
      <div className="card-info">
        <div className="card-brand">{product.brand}</div>
        <div className="card-name">{product.name}</div>
        {product.infoLine && <div className="card-subtitle">{product.infoLine}</div>}
        <div className="card-price">{product.price}</div>
      </div>
      {admin && <CardAdminTools uid={product.uid} />}
    </LinkBox>
  );
});

function CardAdminTools({ uid }: { uid: string }) {
  const admin = useAdmin()!;
  const [menu, setMenu] = useState(false);
  const pill = { top: 10, right: 10, background: 'white', color: 'red', zIndex: 11, border: 'none' };
  return (
    <>
      <AdminIconButton className="admin-pill" icon={faXmark} title="Elimina prodotto" style={pill} onClick={() => admin.deleteProduct(uid)} />
      <AdminIconButton className="move-product-btn" icon={faArrowRightArrowLeft} title="Sposta in altra categoria"
        style={{ right: 55 }} onClick={() => setMenu((open) => !open)} />
      <AdminIconButton className="move-product-btn" icon={faCopy} title="Copia prodotto" style={{ right: 100 }} onClick={() => admin.copyProduct(uid)} />
      <AdminIconButton className="move-product-btn" icon={faArrowUp} title="Sposta prima" style={{ right: 145 }} onClick={() => admin.moveProduct(uid, -1)} />
      <AdminIconButton className="move-product-btn" icon={faArrowDown} title="Sposta dopo" style={{ right: 190 }} onClick={() => admin.moveProduct(uid, 1)} />
      <AdminIconButton className="move-product-btn card-drag" icon={faGripVertical} title="Trascina per riordinare" style={{ right: 235 }} onClick={() => {}} />
      {menu && <CategoryDropdown uid={uid} onClose={() => setMenu(false)} />}
    </>
  );
}

function CategoryDropdown({ uid, onClose }: { uid: string; onClose: () => void }) {
  const admin = useAdmin()!;
  const ref = useRef<HTMLDivElement>(null);
  const catalog = catalogStore.get() as Catalog;
  const current = catalog.macros.flatMap((m) => m.products).find((p) => p.uid === uid)?.categoryId;

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      // il pulsante che apre il menu gestisce da se' la chiusura
      if (ref.current?.contains(target) || (ref.current?.parentElement?.contains(target) && target.closest('.move-product-btn'))) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  return (
    <div ref={ref} className="category-dropdown active" role="menu" onClick={(e) => e.stopPropagation()}>
      {catalog.macros.flatMap((m) => m.subcategories.map((s) => (
        <div key={s.id} role="menuitem" tabIndex={0} className={`category-dropdown-item${s.id === current ? ' current' : ''}`}
          onClick={() => { admin.moveProductTo(uid, m.id, s.id); onClose(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { admin.moveProductTo(uid, m.id, s.id); onClose(); } }}>
          <span>{m.name} » {s.name}</span>
          {s.id === current && <Icon icon={faCheck} />}
        </div>
      )))}
    </div>
  );
}
