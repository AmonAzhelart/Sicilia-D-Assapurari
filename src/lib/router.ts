// Navigazione con URL condivisibili:
//   /<macro>/<sotto>  categoria   ?p=<prodotto> scheda   ?q=<testo> ricerca   ?selezione  richiesta d'ordine
// Il pulsante "indietro" del browser/Android chiude scheda, ricerca e selezione.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Catalog } from '../types';
import { indexCatalog } from './catalog';
import { catalogStore } from './store';

export interface View {
  macroId: string | null;
  subId: string | null;
  productUid: string | null;
  search: string | null;
  selection: boolean;
}

export const HOME: View = { macroId: null, subId: null, productUid: null, search: null, selection: false };

export function viewToUrl(view: View, catalog: Catalog, base: string): string {
  const index = indexCatalog(catalog);
  let path = `${base}/`;
  const macroSlug = view.macroId && index.macroSlug.get(view.macroId);
  if (macroSlug) {
    path += macroSlug;
    const subSlug = view.subId && index.subSlug.get(view.subId);
    if (subSlug) path += `/${subSlug}`;
  }
  const params = new URLSearchParams();
  const productSlug = view.productUid && index.productSlug.get(view.productUid);
  if (productSlug) params.set('p', productSlug);
  if (view.search !== null) params.set('q', view.search);
  if (view.selection) params.set('selezione', '');
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function urlToView(catalog: Catalog, base: string): View {
  const index = indexCatalog(catalog);
  const path = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname;
  const [macroSlug, subSlug] = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(location.search);
  const product = index.productBySlug.get(params.get('p') || '');
  const macro = (macroSlug && index.macroBySlug.get(macroSlug)) || product?.macro;
  const sub = macro && subSlug ? index.subBySlug.get(macro.id)?.get(subSlug) : undefined;
  return {
    macroId: macro?.id ?? null,
    subId: sub?.id ?? (product && product.macro === macro ? product.product.categoryId || null : null),
    productUid: product?.product.uid ?? null,
    search: params.get('q'),
    selection: params.has('selezione'),
  };
}

export function useRouter(ready: boolean, base: string) {
  const [view, setView] = useState<View>(HOME);

  useEffect(() => {
    const catalog = catalogStore.get();
    if (!ready || !catalog) return;
    history.scrollRestoration = 'manual';
    const initial = urlToView(catalog, base);
    history.replaceState({ inApp: false }, '', viewToUrl(initial, catalog, base) + location.hash);
    setView(initial);
    const onPop = () => {
      const current = catalogStore.get();
      if (current) setView(urlToView(current, base));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [ready, base]);

  const navigate = useCallback((next: View, replace = false) => {
    const catalog = catalogStore.get();
    if (!catalog) return;
    const inApp = replace ? !!history.state?.inApp : true;
    history[replace ? 'replaceState' : 'pushState']({ inApp }, '', viewToUrl(next, catalog, base));
    setView(next);
  }, [base]);

  return { view, navigate };
}

export interface Nav {
  goHome(): void;
  selectMacro(id: string): void;
  selectSub(id: string): void;
  /** Aggiorna solo l'URL con la sottocategoria in vista (scroll-spy). */
  markSub(id: string): void;
  openProduct(uid: string): void;
  closeProduct(): void;
  openSearch(): void;
  setSearch(query: string): void;
  closeSearch(): void;
  openSelection(): void;
  closeSelection(): void;
  href(view: Partial<View>): string;
  productHref(uid: string): string;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('NavContext mancante');
  return nav;
}
