// Ricerca in stile palette: pannello sospeso su desktop (frecce + Invio), pagina intera su mobile.
// Senza testo propone categorie e prodotti visti di recente; con il testo, risultati per categoria filtrabili.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Catalog } from '../types';
import { fold, indexCatalog, productFromParam, searchCatalog, type ProductRef } from '../lib/catalog';
import { useAdmin } from '../lib/admin';
import { cx, useEscape, useScrollLock } from '../lib/hooks';
import { recentStore } from '../lib/personal';
import { useNav } from '../lib/router';
import { useStore } from '../lib/store';
import { ProductRow } from './Catalog';
import { Icon } from './Icon';
import { LinkBox } from './ui';

const MIN_CHARS = 2;
const RECENT = 5;
// Invio apre il risultato evidenziato solo con tastiera fisica; su touch chiude la tastiera
const hasKeyboard = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export function SearchOverlay({ catalog, initialQuery }: { catalog: Catalog; initialQuery: string }) {
  const nav = useNav();
  const admin = useAdmin();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const index = indexCatalog(catalog);
  const trimmed = deferred.trim();
  const terms = useMemo(() => fold(trimmed).split(/\s+/).filter(Boolean), [trimmed]);
  const groups = useMemo(
    () => (trimmed.length >= MIN_CHARS ? searchCatalog(index, trimmed) : null),
    [index, trimmed],
  );
  const count = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;
  // il filtro resta solo se la categoria ha ancora risultati
  const shown = groups && filter && groups.some((g) => g.macro.id === filter) ? groups.filter((g) => g.macro.id === filter) : groups;
  const flat = shown?.flatMap((g) => g.items) ?? [];

  const recentKeys = useStore(recentStore);
  const recent = admin ? [] : [...new Set(recentKeys.map((key) => productFromParam(index, key)).filter((r): r is ProductRef => !!r))].slice(0, RECENT);

  useScrollLock(true);
  useEscape(true, nav.closeSearch);
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => setActive(0), [trimmed, filter]);

  // la query finisce nell'URL (condivisibile, ripristinata con "indietro"), con debounce
  useEffect(() => {
    if (query === initialQuery) return;
    const timer = setTimeout(() => nav.setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, initialQuery, nav]);

  // prima di aprire un risultato la ricerca va subito nell'URL: "indietro" la ritrova anche senza attendere il debounce
  const flush = () => {
    if (query !== initialQuery) nav.setSearch(query);
  };

  // il risultato evidenziato resta visibile mentre ci si sposta con le frecce
  const activeUid = flat[active]?.product.uid;
  useEffect(() => {
    if (activeUid) document.getElementById(`sr-${activeUid}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeUid]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      if (activeUid && hasKeyboard()) {
        flush();
        nav.openProduct(activeUid);
      }
      else e.currentTarget.blur();
    }
  };

  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const categories = (
    <div className="search-chips">
      {catalog.macros.filter((m) => admin || m.products.length > 0).map((m) => (
        <LinkBox key={m.id} className="search-chip" href={nav.href({ macroId: m.id })} onOpen={() => nav.selectMacro(m.id)}>
          {m.name}<span>{m.products.length}</span>
        </LinkBox>
      ))}
    </div>
  );

  return (
    <div className="overlay-page" role="dialog" aria-modal="true" aria-label="Ricerca prodotti"
      onClick={(e) => { if (e.target === e.currentTarget) nav.closeSearch(); }}>
      <div className="search-shell">
        <div className="search-bar">
          <Icon icon={faMagnifyingGlass} />
          <input ref={inputRef} type="search" inputMode="search" className="search-input"
            placeholder="Cerca vini, produttori, vitigni…" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown} enterKeyHint="search" autoComplete="off" spellCheck={false} aria-label="Cerca nel catalogo" />
          {query && (
            <button type="button" className="search-clear" onClick={clear} aria-label="Cancella la ricerca">
              <Icon icon={faXmark} />
            </button>
          )}
          <button type="button" className="search-cancel" onClick={nav.closeSearch} aria-label="Chiudi ricerca">
            <kbd>Esc</kbd><span>Annulla</span>
          </button>
        </div>

        <div className="search-body" onClickCapture={flush}>
          {!groups ? (
            <>
              <section className="search-section">
                <h3 className="search-label">Categorie</h3>
                {categories}
              </section>
              {recent.length > 0 && (
                <section className="search-section">
                  <h3 className="search-label">Visti di recente</h3>
                  <div className="prow-list">
                    {recent.map(({ product, sub }) => <ProductRow key={product.uid} product={product} meta={<span>{sub?.name}</span>} />)}
                  </div>
                </section>
              )}
              <p className="search-hint">
                {trimmed ? 'Continua a scrivere…' : 'Cerca per nome, produttore, vitigno, zona o prezzo.'}
              </p>
            </>
          ) : !count ? (
            <div className="search-none">
              <div className="search-none-title">Nessun risultato per «{trimmed}»</div>
              <p>Prova con il nome di un produttore, un vitigno o una zona. Oppure sfoglia una categoria:</p>
              {categories}
            </div>
          ) : (
            <>
              <div className="search-summary" aria-live="polite">
                {count} {count === 1 ? 'risultato' : 'risultati'} per «{trimmed}»
              </div>
              {groups.length > 1 && (
                <div className="search-filters" role="group" aria-label="Filtra per categoria">
                  <button type="button" className={cx('search-filter', shown === groups && 'active')} onClick={() => setFilter(null)}>
                    Tutti <span>{count}</span>
                  </button>
                  {groups.map(({ macro, items }) => (
                    <button key={macro.id} type="button" className={cx('search-filter', shown !== groups && filter === macro.id && 'active')}
                      onClick={() => setFilter(macro.id)}>
                      {macro.name} <span>{items.length}</span>
                    </button>
                  ))}
                </div>
              )}
              {shown!.map(({ macro, items }) => (
                <section key={macro.id} className="search-section">
                  <h3 className="search-label">{macro.name}<span>{items.length}</span></h3>
                  <div className="prow-list">
                    {items.map(({ product, sub }) => (
                      <ProductRow key={product.uid} id={`sr-${product.uid}`} product={product} terms={terms}
                        active={product.uid === activeUid} meta={<span>{sub?.name}</span>} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>

        <div className="search-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> per scegliere</span>
          <span><kbd>Invio</kbd> per aprire</span>
          <span><kbd>Esc</kbd> per chiudere</span>
        </div>
      </div>
    </div>
  );
}
