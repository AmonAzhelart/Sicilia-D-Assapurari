import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Catalog } from './types';
import { indexCatalog } from './lib/catalog';
import { usePerfLite } from './lib/hooks';
import { HOME, NavContext, useRouter, viewToUrl, type Nav, type View } from './lib/router';
import { catalogStore, useStore } from './lib/store';
import { CategoryHome, Hero, Section, ShippingBanner } from './components/Catalog';
import { Header } from './components/Header';
import { ProductSheet } from './components/ProductSheet';
import { SearchOverlay } from './components/SearchOverlay';
import { Loader, Toasts } from './components/ui';

interface AppProps {
  load: () => Promise<Catalog>;
  /** Prefisso delle rotte: '' per il sito, '/admin' per l'amministrazione. */
  base: string;
  dirty?: boolean;
}

export function App({ load, base, dirty }: AppProps) {
  const catalog = useStore(catalogStore);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lite = usePerfLite();

  useEffect(() => {
    let live = true;
    setError(null);
    load()
      .then((data) => { if (live) catalogStore.set(data); })
      .catch((err) => {
        console.error(err);
        if (live) setError('Impossibile caricare il catalogo. Controlla la connessione e riprova.');
      });
    return () => { live = false; };
  }, [load, attempt]);

  const { view, navigate } = useRouter(!!catalog, base);
  const viewRef = useRef(view);
  viewRef.current = view;

  const nav = useMemo<Nav>(() => {
    const current = () => viewRef.current;
    const data = () => catalogStore.get()!;
    // chiude un overlay tornando indietro se l'abbiamo aperto noi, altrimenti sostituisce l'URL
    const closeTo = (next: View) => (history.state?.inApp ? history.back() : navigate(next, true));
    const productView = (uid: string): View | null => {
      const ref = indexCatalog(data()).byUid.get(uid);
      return ref ? { macroId: ref.macro.id, subId: ref.product.categoryId || null, productUid: uid, search: null } : null;
    };
    return {
      goHome: () => navigate(HOME),
      selectMacro: (id) => navigate({ ...HOME, macroId: id }),
      selectSub: (id) => navigate({ ...current(), subId: id, productUid: null, search: null }, true),
      openProduct: (uid) => {
        const next = productView(uid);
        if (next) navigate(next);
      },
      closeProduct: () => closeTo({ ...current(), productUid: null }),
      openSearch: () => navigate({ ...current(), productUid: null, search: current().search ?? '' }),
      setSearch: (query) => navigate({ ...current(), search: query }, true),
      closeSearch: () => closeTo({ ...current(), search: null }),
      href: (partial) => viewToUrl({ ...HOME, ...partial }, data(), base),
      productHref: (uid) => viewToUrl(productView(uid) ?? HOME, data(), base),
    };
  }, [navigate, base]);

  const macro = catalog?.macros.find((m) => m.id === view.macroId);
  const sub = macro?.subcategories.find((s) => s.id === view.subId) ?? macro?.subcategories[0];
  const entry = catalog && view.productUid ? indexCatalog(catalog).byUid.get(view.productUid) : undefined;

  // cambio categoria: si riparte dall'alto; cambio sottocategoria: si torna all'inizio della griglia
  const sectionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [macro?.id]);
  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const header = document.querySelector('.top-bar')?.getBoundingClientRect().height ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY - header - 12;
    if (window.scrollY > top) window.scrollTo({ top, behavior: lite ? 'auto' : 'smooth' });
  }, [sub?.id]);

  useEffect(() => {
    const title = catalog?.title || "SICILIA D'ASSAPURARI";
    document.title = entry ? `${entry.product.name} · ${title}` : macro ? `${macro.name} · ${title}` : title;
  }, [catalog?.title, macro, entry]);

  return (
    <NavContext.Provider value={nav}>
      <Loader ready={!!catalog} error={error} onRetry={() => setAttempt((n) => n + 1)} />
      {catalog && (
        <>
          <Header catalog={catalog} macro={macro} subId={sub?.id} dirty={dirty} />
          {macro ? (
            <>
              <Hero key={macro.id} macro={macro} />
              <ShippingBanner />
              <main className="container" ref={sectionRef}>
                {sub ? <Section key={sub.id} macro={macro} sub={sub} /> : (
                  <div className="category-empty">
                    <div className="category-empty-title">Nessuna sottocategoria</div>
                    <div className="category-empty-text">La categoria "{macro.name}" non contiene ancora prodotti.</div>
                  </div>
                )}
              </main>
            </>
          ) : (
            <main>
              <ShippingBanner />
              <CategoryHome macros={catalog.macros} />
            </main>
          )}
          <ProductSheet entry={entry} />
          {view.search !== null && <SearchOverlay catalog={catalog} initialQuery={view.search} />}
        </>
      )}
      <Toasts />
    </NavContext.Provider>
  );
}
