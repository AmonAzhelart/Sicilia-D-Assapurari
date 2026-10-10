import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import {
  faArrowDown, faArrowRightArrowLeft, faArrowUp, faCamera, faCheck, faCopy, faGripVertical, faPaste, faPlus,
  faRightLeft, faTag, faTruckFast, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Catalog, Macro, Product, Sub } from '../types';
import { useAdmin } from '../lib/admin';
import { cx, scrollToSection } from '../lib/hooks';
import { indexCatalog } from '../lib/catalog';
import { addToSelection, selectionStore } from '../lib/personal';
import { formatPrice, packOffers, priceInfo, type PackOffer } from '../lib/pricing';
import { useNav } from '../lib/router';
import { useSortable } from '../lib/sortable';
import { catalogStore, sectionStore, useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Editable } from './Editable';
import { Icon } from './Icon';
import { AdminIconButton, LinkBox, Media } from './ui';

/* ---------- Hero di categoria ---------- */

export function Hero({ macro }: { macro: Macro }) {
  const admin = useAdmin();
  const edit = (field: 'heroTag' | 'heroTitle' | 'heroDesc') =>
    admin ? (value: string) => admin.setMacro(macro.id, { [field]: value }) : undefined;
  // in admin il campo vuoto mostra il testo di riserva come segnaposto (senza riscriverlo mentre si digita)
  const shown = (value: string, fallback: string) => (admin ? value : value || fallback);
  return (
    <div className="hero">
      {macro.heroImage && <img className="hero-img" src={macro.heroImage} alt="" decoding="async" fetchPriority="high" />}
      <div className="hero-overlay" />
      <div className="hero-content">
        <Editable className="hero-tag editable-placeholder" value={shown(macro.heroTag, macro.name.toUpperCase())}
          placeholder={macro.name.toUpperCase()} onChange={edit('heroTag')} singleLine />
        <Editable className="hero-title editable-placeholder" role="heading" aria-level={1} value={shown(macro.heroTitle, macro.name)}
          placeholder={macro.name}
          onChange={edit('heroTitle')} singleLine />
        {(macro.heroDesc || admin) && (
          <Editable as="p" className="hero-desc" value={macro.heroDesc} onChange={edit('heroDesc')} placeholder="Descrizione" />
        )}
        {macro.products.length > 0 && (
          <div className="hero-meta">
            <span>{macro.products.length} prodotti</span>
            {macro.subcategories.length > 1 && <span>{macro.subcategories.length} selezioni</span>}
          </div>
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

/* ---------- Pagina categoria: tutte le sottocategorie in un unico scorrimento ---------- */

type Sort = '' | 'price-asc' | 'price-desc' | 'name';
interface Filters { offers: boolean; brand: string; sort: Sort }
const NO_FILTERS: Filters = { offers: false, brand: '', sort: '' };

const hasOffer = (p: Product) => priceInfo(p).discount > 0 || packOffers(p).length > 0;
const unitPrice = (p: Product) => priceInfo(p).final ?? Number.POSITIVE_INFINITY;

function applyFilters(products: Product[], f: Filters): Product[] {
  const list = products.filter((p) => (!f.offers || hasOffer(p)) && (!f.brand || p.brand.trim() === f.brand));
  if (f.sort === 'price-asc') list.sort((a, b) => unitPrice(a) - unitPrice(b));
  else if (f.sort === 'price-desc') list.sort((a, b) => unitPrice(b) - unitPrice(a));
  else if (f.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return list;
}

export function CategoryPage({ macro, initialSubId }: { macro: Macro; initialSubId: string | null }) {
  const admin = useAdmin();
  const nav = useNav();
  const [filters, setFilters] = useState(NO_FILTERS);
  // in admin si lavora sempre sull'ordine reale, senza filtri
  const active = admin ? NO_FILTERS : filters;
  const filtering = active.offers || !!active.brand;
  const groups = useMemo(() => macro.subcategories
    .map((sub) => ({ sub, products: applyFilters(macro.products.filter((p) => p.categoryId === sub.id), active) }))
    // nel sito pubblico le sottocategorie vuote non compaiono
    .filter((g) => admin || g.products.length > 0), [macro, active, admin]);
  const total = groups.reduce((n, g) => n + g.products.length, 0);
  const ids = groups.map((g) => g.sub.id);
  const idsKey = ids.join('|');

  // all'apertura: in cima, oppure direttamente alla sottocategoria richiesta (link condiviso)
  useLayoutEffect(() => {
    if (initialSubId && initialSubId !== macro.subcategories[0]?.id) scrollToSection(initialSubId, false);
    else window.scrollTo(0, 0);
  }, []);

  // scroll-spy: evidenzia nei chip la sottocategoria in vista e la riporta nell'URL
  useEffect(() => {
    sectionStore.set({ active: null, visible: admin ? null : ids });
    let frame = 0;
    let urlTimer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      frame = 0;
      const offset = (document.querySelector<HTMLElement>('.top-bar')?.offsetHeight ?? 0) + 40;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(`section-${id}`);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      if (atBottom && window.scrollY > 0) current = ids[ids.length - 1] ?? current;
      if (sectionStore.get().active === current) return;
      sectionStore.set((s) => ({ ...s, active: current }));
      clearTimeout(urlTimer);
      if (current) urlTimer = setTimeout(() => nav.markSub(current), 600);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(urlTimer);
    };
  }, [idsKey, admin, nav]);

  useEffect(() => () => sectionStore.set({ active: null, visible: null }), []);

  return (
    <>
      <Hero macro={macro} />
      <ShippingBanner />
      <main className="container category-main">
        {!admin && macro.products.length > 0 && (
          <CatalogToolbar macro={macro} filters={filters} total={total} onChange={setFilters} />
        )}
        {groups.map(({ sub, products }) => <Section key={sub.id} macro={macro} sub={sub} products={products} />)}
        {!groups.length && (
          <div className="category-empty">
            <div className="category-empty-title">{filtering ? 'Nessun prodotto con questi filtri' : 'Nessun prodotto ancora disponibile'}</div>
            <div className="category-empty-text">
              {filtering
                ? <button type="button" className="hero-cta" onClick={() => setFilters(NO_FILTERS)}>Mostra tutti i prodotti</button>
                : `La categoria "${macro.name}" non contiene ancora prodotti.`}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function CatalogToolbar({ macro, filters, total, onChange }: {
  macro: Macro; filters: Filters; total: number; onChange: (f: Filters) => void;
}) {
  const brands = useMemo(
    () => [...new Set(macro.products.map((p) => p.brand.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')),
    [macro.products],
  );
  // il filtro serve solo se separa qualcosa: nascosto se nessuno o tutti i prodotti sono in offerta
  const offers = useMemo(() => macro.products.some(hasOffer) && !macro.products.every(hasOffer), [macro.products]);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  return (
    <div className="catalog-toolbar" role="search" aria-label="Filtra e ordina">
      <div className="toolbar-count" aria-live="polite"><strong>{total}</strong> {total === 1 ? 'prodotto' : 'prodotti'}</div>
      <div className="toolbar-controls">
        {offers && (
          <button type="button" className={cx('toolbar-chip', filters.offers && 'active')} aria-pressed={filters.offers}
            onClick={() => set({ offers: !filters.offers })}>
            <Icon icon={faTag} /> Offerte
          </button>
        )}
        {brands.length >= 3 && (
          <label className="toolbar-select">
            <span className="sr-only">Produttore</span>
            <select value={filters.brand} onChange={(e) => set({ brand: e.target.value })}>
              <option value="">Tutti i produttori</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        )}
        <label className="toolbar-select">
          <span className="sr-only">Ordina</span>
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
            <option value="">Ordine consigliato</option>
            <option value="price-asc">Prezzo crescente</option>
            <option value="price-desc">Prezzo decrescente</option>
            <option value="name">Nome A–Z</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/* ---------- Sottocategoria con griglia prodotti ---------- */

export function Section({ macro, sub, products }: { macro: Macro; sub: Sub; products: Product[] }) {
  const nav = useNav();
  const admin = useAdmin();
  const gridRef = useRef<HTMLDivElement>(null);

  useSortable(gridRef, {
    enabled: !!admin,
    item: '.pcard',
    handle: '.card-drag',
    onMove: (from, to) => admin?.reorderProduct(products[from].uid, products[to].uid),
  });

  const add = (uid: string | null) => {
    if (uid) nav.openProduct(uid);
  };

  return (
    <section className="section-pane" id={`section-${sub.id}`} aria-labelledby={`sec-${sub.id}`}>
      <div className="section-header">
        <div className="section-heading">
          <div className="sec-kicker">Sottocategoria</div>
          <div className="sec-title" id={`sec-${sub.id}`} role="heading" aria-level={2}>{sub.name}</div>
          <div className="sec-subtitle">{products.length === 1 ? '1 prodotto' : `${products.length} prodotti`}</div>
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

/**
 * Card prodotto. `compact` e' la versione per le righe scorrevoli (home, correlati).
 * Sito pubblico: tutta la card e' un link (link "esteso" sotto il contenuto) e il "+" aggiunge
 * alla selezione senza aprire la scheda. Admin: niente "+", ma i comandi di modifica.
 */
export const ProductCard = memo(function ProductCard({ product, eager = false, compact = false }: {
  product: Product; eager?: boolean; compact?: boolean;
}) {
  const nav = useNav();
  const admin = useAdmin();
  const editing = !!admin && !compact;
  const price = priceInfo(product);
  // offerta pack piu' conveniente al pezzo, mostrata sotto il prezzo
  const bestPack = packOffers(product).reduce<PackOffer | null>(
    (best, o) => (o.perUnit !== null && (!best || o.perUnit < best.perUnit!) ? o : best), null);
  const label = [product.brand, product.name, price.label].filter(Boolean).join(' – ');
  const open = () => nav.openProduct(product.uid);

  const body = (
    <>
      <Media className="pcard-media" imgClassName="pcard-img" src={product.images[0] || ''} mode={product.imagesMode[0]}
        variant="card" eager={eager} alt={product.name}
        placeholder={<div className="pcard-noimg"><Icon icon={faImage} /></div>} />
      {price.discount > 0 && <span className="pcard-sale sale-badge">-{price.discount}%</span>}
      <div className="pcard-info">
        <div className="pcard-brand">{product.brand}</div>
        <div className="pcard-name">{product.name}</div>
        {!compact && product.infoLine && <div className="pcard-sub">{product.infoLine}</div>}
        <div className="pcard-foot">
          <div className="pcard-price">
            <strong>{price.label}</strong>
            {price.discount > 0 && <s>{product.price}</s>}
            {bestPack && <small>Pack {bestPack.qty} · {formatPrice(bestPack.perUnit!, product.price)} cad.</small>}
          </div>
        </div>
      </div>
    </>
  );

  if (editing) {
    return (
      <LinkBox className="pcard" href={nav.productHref(product.uid)} onOpen={open} asDiv label={label}>
        {body}
        <CardAdminTools uid={product.uid} />
      </LinkBox>
    );
  }
  return (
    <article className={cx('pcard', compact && 'is-compact')}>
      <a className="pcard-link" href={nav.productHref(product.uid)} aria-label={label}
        onClick={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); open(); } }} />
      {body}
      <QuickAdd product={product} />
    </article>
  );
});

/** "+" sulla card: aggiunge un pezzo alla selezione; se il prodotto c'e' gia' mostra quanti pezzi. */
function QuickAdd({ product }: { product: Product }) {
  const slug = indexCatalog(catalogStore.get()!).productSlug.get(product.uid) ?? '';
  const qty = useStore(selectionStore)[slug] ?? 0;
  if (!slug) return null;
  return (
    <button type="button" className={cx('pcard-add', qty > 0 && 'in')}
      aria-label={qty ? `Aggiungi un altro pezzo (nella selezione: ${qty})` : 'Aggiungi alla selezione'}
      title={qty ? `Nella selezione: ${qty} pz` : 'Aggiungi alla selezione'}
      onClick={() => {
        addToSelection(slug, 1);
        toast(`Aggiunto alla selezione: ${product.name || 'prodotto'}`);
      }}>
      {qty > 0 ? <span className="pcard-add-count">{qty > 99 ? '99+' : qty}</span> : <Icon icon={faPlus} />}
    </button>
  );
}

/** Badge "-20%" (prodotto scontato) e "PACK" (offerte multiple, con lo sconto massimo). */
export function OfferBadges({ product, className }: { product: Product; className: string }) {
  const { discount } = priceInfo(product);
  const packs = packOffers(product);
  if (!discount && !packs.length) return null;
  const bestPack = Math.max(0, ...packs.map((p) => p.discount));
  return (
    <div className={className}>
      {discount > 0 && <span className="sale-badge">-{discount}%</span>}
      {packs.length > 0 && <span className="pack-badge">PACK{bestPack ? ` -${bestPack}%` : ''}</span>}
    </div>
  );
}

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
