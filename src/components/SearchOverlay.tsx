import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { faFaceFrown, faImage } from '@fortawesome/free-regular-svg-icons';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Catalog } from '../types';
import { indexCatalog, searchCatalog } from '../lib/catalog';
import { useEscape, useScrollLock } from '../lib/hooks';
import { priceInfo } from '../lib/pricing';
import { useNav } from '../lib/router';
import { OfferBadges } from './Catalog';
import { Icon } from './Icon';
import { LinkBox, Media } from './ui';

const MIN_CHARS = 2;
const EAGER_RESULTS = 6;

export function SearchOverlay({ catalog, initialQuery }: { catalog: Catalog; initialQuery: string }) {
  const nav = useNav();
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = deferred.trim();
  const groups = useMemo(
    () => (trimmed.length >= MIN_CHARS ? searchCatalog(indexCatalog(catalog), trimmed) : null),
    [catalog, trimmed],
  );
  const count = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;

  useScrollLock(true);
  useEscape(true, nav.closeSearch);
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);

  // la query finisce nell'URL (condivisibile, ripristinata con "indietro"), con debounce
  useEffect(() => {
    if (query === initialQuery) return;
    const timer = setTimeout(() => nav.setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, initialQuery, nav]);

  const meta = trimmed.length < MIN_CHARS
    ? (trimmed.length ? 'Continua a digitare...' : 'Nessuna ricerca attiva')
    : count ? `${count} ${count === 1 ? 'risultato' : 'risultati'}` : 'Nessun risultato';
  let rendered = 0;

  return (
    <div className="overlay-page" role="dialog" aria-modal="true" aria-label="Ricerca prodotti">
      <div className="search-shell">
        <div className="search-header">
          <div className="search-title-wrap">
            <span className="search-kicker">Ricerca rapida</span>
            <h2 className="search-title">Trova un prodotto</h2>
            <div className="search-subtitle">Cerca per brand, nome, vitigno o prezzo e apri subito la scheda.</div>
          </div>
          <button className="search-close" type="button" onClick={nav.closeSearch} aria-label="Chiudi ricerca">
            <Icon icon={faXmark} />
          </button>
        </div>
        <div className="search-input-wrap">
          <Icon icon={faMagnifyingGlass} />
          <input ref={inputRef} type="text" inputMode="search" className="search-input" placeholder="Cerca un prodotto, un brand o un prezzo"
            value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" autoComplete="off"
            aria-label="Cerca nel catalogo" />
        </div>
        <div className="search-helper">
          <span>Digita almeno {MIN_CHARS} caratteri per iniziare.</span>
          <span className="search-results-meta" aria-live="polite">{meta}</span>
        </div>
        <div className="search-results-list">
          {!groups ? (
            <div className="search-empty">
              <Icon icon={faMagnifyingGlass} />
              <div className="search-empty-title">Cerca tra i prodotti</div>
              <div className="search-empty-text">Inserisci almeno {MIN_CHARS} caratteri per visualizzare i risultati. Puoi cercare per brand, nome, vitigno o prezzo.</div>
            </div>
          ) : !count ? (
            <div className="search-empty">
              <Icon icon={faFaceFrown} />
              <div className="search-empty-title">Nessun prodotto trovato</div>
              <div className="search-empty-text">Prova con un altro termine, ad esempio un brand, una parte del nome o il prezzo.</div>
            </div>
          ) : groups.map(({ macro, items }) => (
            <section key={macro.id} className="search-group">
              <div className="search-group-header">
                <div className="search-group-title">{macro.name}</div>
                <div className="search-group-count">{items.length} {items.length === 1 ? 'elemento' : 'elementi'}</div>
              </div>
              <div className="search-group-items">
                {items.map(({ product, sub }) => (
                  <LinkBox key={product.uid} className="search-result-item" href={nav.productHref(product.uid)}
                    onOpen={() => nav.openProduct(product.uid)}>
                    <Media className="search-result-media" imgClassName="search-result-img" src={product.images[0] || ''}
                      mode={product.imagesMode[0]} variant="search" eager={rendered++ < EAGER_RESULTS} alt=""
                      placeholder={<div className="search-result-no-img" style={{ display: 'flex' }}><Icon icon={faImage} /></div>} />
                    <div className="search-result-content">
                      <div className="search-result-topline">
                        <div className="search-result-brand">{product.brand || 'Prodotto'}</div>
                        <div className="search-result-price">{priceInfo(product).label}</div>
                      </div>
                      <div className="search-result-name">{product.name}</div>
                      {product.infoLine && <div className="search-result-subtitle">{product.infoLine}</div>}
                      <div className="search-result-meta">
                        <OfferBadges product={product} className="search-result-offers" />
                        <span className="search-result-badge subcategory">{sub?.name || 'Sottocategoria'}</span>
                        <span className="search-result-badge">{macro.name}</span>
                      </div>
                    </div>
                  </LinkBox>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
