import { useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog } from './types';
import { indexCatalog } from './lib/catalog';
import { useAdmin } from './lib/admin';
import { scrollToSection, usePerfLite } from './lib/hooks';
import { HOME, NavContext, useRouter, viewToUrl, type Nav, type View } from './lib/router';
import { catalogStore, useStore } from './lib/store';
import { CategoryPage } from './components/Catalog';
import { Header } from './components/Header';
import { Footer, HomePage } from './components/Home';
import { ProductSheet } from './components/ProductSheet';
import { SearchOverlay } from './components/SearchOverlay';
import { SelectionBar, SelectionDrawer } from './components/Selection';
import { Loader, Toasts } from './components/ui';

interface AppProps {
  load: () => Promise<Catalog>;
  /** Prefisso delle rotte: '' per il sito, '/admin' per l'amministrazione. */
  base: string;
  dirty?: boolean;
}

export function App({ load, base, dirty }: AppProps) {
  const catalog = useStore(catalogStore);
  const admin = useAdmin();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  usePerfLite();

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
      return ref ? { ...HOME, macroId: ref.macro.id, subId: ref.product.categoryId || null, productUid: uid } : null;
    };
    return {
      goHome: () => navigate(HOME),
      selectMacro: (id) => navigate({ ...HOME, macroId: id }),
      selectSub: (id) => {
        navigate({ ...current(), subId: id, productUid: null, search: null, selection: false }, true);
        scrollToSection(id);
      },
      markSub: (id) => history.replaceState(history.state, '', viewToUrl({ ...current(), subId: id }, data(), base)),
      openProduct: (uid) => {
        const next = productView(uid);
        if (next) navigate(next);
      },
      closeProduct: () => closeTo({ ...current(), productUid: null }),
      openSearch: () => navigate({ ...current(), productUid: null, selection: false, search: current().search ?? '' }),
      setSearch: (query) => navigate({ ...current(), search: query }, true),
      closeSearch: () => closeTo({ ...current(), search: null }),
      openSelection: () => navigate({ ...current(), productUid: null, search: null, selection: true }),
      closeSelection: () => closeTo({ ...current(), selection: false }),
      href: (partial) => viewToUrl({ ...HOME, ...partial }, data(), base),
      productHref: (uid) => viewToUrl(productView(uid) ?? HOME, data(), base),
    };
  }, [navigate, base]);

  const macro = catalog?.macros.find((m) => m.id === view.macroId);
  const entry = catalog && view.productUid ? indexCatalog(catalog).byUid.get(view.productUid) : undefined;

  // la home riparte sempre dall'alto (la pagina categoria gestisce da se' il proprio scorrimento)
  useEffect(() => {
    if (catalog && !macro) window.scrollTo(0, 0);
  }, [!!catalog, macro?.id]);

  useEffect(() => {
    const title = catalog?.title || "SICILIA D'ASSAPURARI";
    document.title = entry ? `${entry.product.name} · ${title}` : macro ? `${macro.name} · ${title}` : title;
  }, [catalog?.title, macro, entry]);

  return (
    <NavContext.Provider value={nav}>
      <Loader ready={!!catalog} error={error} onRetry={() => setAttempt((n) => n + 1)} />
      {catalog && (
        <>
          <Header catalog={catalog} macro={macro} subId={view.subId ?? macro?.subcategories[0]?.id} dirty={dirty} />
          {macro
            ? <CategoryPage key={macro.id} macro={macro} initialSubId={view.subId} />
            : <HomePage catalog={catalog} />}
          <Footer catalog={catalog} />
          <ProductSheet entry={entry} />
          {view.search !== null && <SearchOverlay catalog={catalog} initialQuery={view.search} />}
          {!admin && view.selection && <SelectionDrawer catalog={catalog} />}
          {!admin && !entry && view.search === null && !view.selection && <SelectionBar catalog={catalog} />}
        </>
      )}
      <Toasts />
    </NavContext.Provider>
  );
}
