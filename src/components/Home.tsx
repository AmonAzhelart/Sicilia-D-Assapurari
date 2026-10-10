import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons';
import { faArrowDown, faArrowRight, faBagShopping, faCamera, faTruckFast } from '@fortawesome/free-solid-svg-icons';
import type { Catalog, Macro } from '../types';
import { indexCatalog, splitTitle, type ProductRef } from '../lib/catalog';
import { useAdmin } from '../lib/admin';
import { cx, useReveal } from '../lib/hooks';
import { recentStore } from '../lib/personal';
import { packOffers, priceInfo } from '../lib/pricing';
import { useNav } from '../lib/router';
import { useStore } from '../lib/store';
import { ProductCard } from './Catalog';
import { Editable } from './Editable';
import { Icon } from './Icon';
import { AdminIconButton, LinkBox, ScrollRow } from './ui';

export const DEFAULT_TAGLINE = 'Il meglio della Sicilia, dalla terra alla tavola';

/** Numero WhatsApp -> cifre per wa.me (null se non valido). */
export function whatsappDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= 8 ? digits : null;
}

/* ---------- Home ---------- */

export function HomePage({ catalog }: { catalog: Catalog }) {
  const ref = useRef<HTMLElement>(null);
  const index = indexCatalog(catalog);
  const recentSlugs = useStore(recentStore);
  const offers = useMemo(() => index.entries
    .filter(({ product }) => priceInfo(product).discount > 0 || packOffers(product).length > 0)
    .sort((a, b) => priceInfo(b.product).discount - priceInfo(a.product).discount)
    .slice(0, 16), [index]);
  const recent = recentSlugs.map((slug) => index.productBySlug.get(slug)).filter((r): r is ProductRef => !!r);
  useReveal(ref, [offers.length, recent.length, catalog.macros.length]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({
    behavior: document.body.classList.contains('perf-lite') ? 'auto' : 'smooth', block: 'start',
  });

  return (
    <main ref={ref} className="home">
      <HomeHero catalog={catalog} hasOffers={offers.length > 0}
        onExplore={() => scrollTo('categorie')} onOffers={() => scrollTo('offerte')} />
      <Stats catalog={catalog} />
      <CategoryGrid macros={catalog.macros} />
      <ProductRail id="offerte" kicker="Occasioni" title="In offerta" items={offers} />
      <ProductRail id="recenti" kicker="Per te" title="Visti di recente" items={recent} />
    </main>
  );
}

function HomeHero({ catalog, hasOffers, onExplore, onOffers }: {
  catalog: Catalog; hasOffers: boolean; onExplore: () => void; onOffers: () => void;
}) {
  const admin = useAdmin();
  const cover = catalog.macros.find((m) => m.heroImage || m.bgImage);
  const [eyebrow, wordmark] = splitTitle(catalog.title || "SICILIA D'ASSAPURARI");
  return (
    <section className="home-hero" aria-label="Benvenuto">
      {cover && <img className="home-hero-img" src={cover.heroImage || cover.bgImage} alt="" decoding="async" fetchPriority="high" />}
      <div className="home-hero-shade" />
      <div className="home-hero-content">
        <span className="home-hero-eyebrow">{eyebrow}</span>
        <span className="home-hero-rule" aria-hidden="true" />
        <h1 className="home-hero-title">{wordmark}</h1>
        <Editable as="p" className="home-hero-tagline editable-placeholder" value={admin ? catalog.tagline : catalog.tagline || DEFAULT_TAGLINE}
          placeholder={DEFAULT_TAGLINE} onChange={admin ? (tagline) => admin.setMeta({ tagline }) : undefined} singleLine />
        <div className="home-hero-actions">
          <button type="button" className="hero-cta primary" onClick={onExplore}>
            Esplora il catalogo <Icon icon={faArrowDown} />
          </button>
          {hasOffers && <button type="button" className="hero-cta" onClick={onOffers}>Le offerte</button>}
        </div>
      </div>
      <button type="button" className="home-hero-scroll" onClick={onExplore} aria-label="Scorri alle categorie"><span /></button>
    </section>
  );
}

function Stats({ catalog }: { catalog: Catalog }) {
  const products = catalog.macros.reduce((n, m) => n + m.products.length, 0);
  const brands = new Set(catalog.macros.flatMap((m) => m.products.map((p) => p.brand.trim().toLowerCase()).filter(Boolean))).size;
  return (
    <div className="home-stats reveal">
      <div className="home-stat"><strong>{catalog.macros.length}</strong><span>Categorie</span></div>
      <div className="home-stat"><strong>{products}</strong><span>Prodotti</span></div>
      <div className="home-stat"><strong>{brands}</strong><span>Produttori</span></div>
      <div className="home-stat home-stat-ship">
        <Icon icon={faTruckFast} /><span>Spedizione gratuita<br />su tutti i prodotti</span>
      </div>
    </div>
  );
}

function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="home-head">
      <div>
        <div className="home-kicker">{kicker}</div>
        <h2 className="home-title">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/* ---------- Categorie a griglia "bento" ---------- */

/** Colonne occupate dall'ultima card per chiudere la riga (la prima card e' larga 2 colonne). */
function lastSpan(count: number, columns: number) {
  const remainder = (count + 1) % columns;
  return remainder ? columns - remainder + 1 : 1;
}

function CategoryGrid({ macros }: { macros: Macro[] }) {
  const nav = useNav();
  const admin = useAdmin();
  return (
    <section className="home-section" id="categorie">
      <SectionHead kicker="Il catalogo" title="Le nostre categorie" />
      <div className="cat-home-grid bento">
        {macros.map((m, i) => {
          const last = i === macros.length - 1 && i > 0;
          const style = last ? { '--span-md': lastSpan(macros.length, 2), '--span-lg': lastSpan(macros.length, 3) } as CSSProperties : undefined;
          const preview = m.subcategories.slice(0, 3).map((s) => s.name).join(' · ');
          const more = m.subcategories.length - 3;
          return (
            <LinkBox key={m.id} className={cx('cat-home-card reveal', i === 0 && 'is-featured')} style={style}
              href={nav.href({ macroId: m.id })} onOpen={() => nav.selectMacro(m.id)} asDiv={!!admin} label={m.name}>
              {m.bgImage
                ? <img className="cat-home-card-bg" src={m.bgImage} alt="" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                : <><div className="cat-home-no-img"><Icon icon={faImage} /></div><div className="cat-home-card-bg" /></>}
              <div className="cat-home-card-overlay" />
              <span className="cat-home-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <div className="cat-home-card-body">
                <div className="cat-home-card-name">{m.name}</div>
                <div className="cat-home-card-meta">{m.products.length ? `${m.products.length} prodotti` : 'Esplora'}</div>
                {preview && <div className="cat-home-card-subs">{preview}{more > 0 ? ` · +${more}` : ''}</div>}
              </div>
              <div className="cat-home-card-arrow"><Icon icon={faArrowRight} /></div>
              {admin && (
                <AdminIconButton className="cat-home-bg-btn" icon={faCamera} title="Cambia immagine di sfondo"
                  onClick={() => admin.pickMacroImage(m.id, 'bgImage')} />
              )}
            </LinkBox>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Rail di prodotti ---------- */

export function ProductRail({ id, kicker, title, items, compact }: {
  id?: string; kicker: string; title: string; items: ProductRef[]; compact?: boolean;
}) {
  if (!items.length) return null;
  return (
    <section className={cx('home-section rail-section', !compact && 'reveal')} id={id}>
      <SectionHead kicker={kicker} title={title} />
      <ScrollRow wrapperClass="rail" scrollerClass="rail-track" label={title}>
        {items.map(({ product }) => <ProductCard key={product.uid} product={product} compact />)}
      </ScrollRow>
    </section>
  );
}

/* ---------- Footer ---------- */

export function Footer({ catalog }: { catalog: Catalog }) {
  const nav = useNav();
  const admin = useAdmin();
  const [eyebrow, wordmark] = splitTitle(catalog.title || "SICILIA D'ASSAPURARI");
  const phone = whatsappDigits(catalog.whatsapp);
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <a className="brand" href={nav.href({})} onClick={(e) => { e.preventDefault(); nav.goHome(); }}>
            <span className="brand-eyebrow">{eyebrow}</span>
            <span className="brand-divider" />
            <span className="brand-wordmark">{wordmark}</span>
          </a>
          <p>{catalog.tagline || DEFAULT_TAGLINE}</p>
        </div>
        <nav className="footer-col" aria-label="Categorie">
          <h3>Categorie</h3>
          {catalog.macros.map((m) => (
            <a key={m.id} href={nav.href({ macroId: m.id })} onClick={(e) => { e.preventDefault(); nav.selectMacro(m.id); }}>{m.name}</a>
          ))}
        </nav>
        <div className="footer-col">
          <h3>Servizio</h3>
          <p><Icon icon={faTruckFast} /> Spedizione gratuita su tutti i prodotti</p>
          {!admin && <button type="button" onClick={nav.openSelection}><Icon icon={faBagShopping} /> Prepara la tua selezione e inviaci la richiesta</button>}
          {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"><Icon icon={faWhatsapp} /> Scrivici su WhatsApp</a>}
        </div>
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} {catalog.title || "Sicilia D'Assapurari"} · Catalogo digitale</div>
    </footer>
  );
}
