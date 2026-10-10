import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { LITE_QUERY } from './images';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Dispositivi touch/piccoli o "riduci movimento": animazioni ed effetti pesanti disattivati (classe perf-lite). */
export function usePerfLite(): boolean {
  const lite = useMediaQuery(LITE_QUERY);
  useEffect(() => {
    document.body.classList.toggle('perf-lite', lite);
  }, [lite]);
  return lite;
}

const observers = new Map<string, { io: IntersectionObserver; callbacks: WeakMap<Element, () => void> }>();

/** Diventa true (una volta sola) quando l'elemento si avvicina al viewport. */
export function useInView(ref: RefObject<Element | null>, enabled: boolean, margin = '300px 0px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || seen || !el) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    let entry = observers.get(margin);
    if (!entry) {
      const callbacks = new WeakMap<Element, () => void>();
      const io = new IntersectionObserver((items) => {
        for (const item of items) if (item.isIntersecting) callbacks.get(item.target)?.();
      }, { rootMargin: margin });
      observers.set(margin, (entry = { io, callbacks }));
    }
    const { io, callbacks } = entry;
    callbacks.set(el, () => {
      io.unobserve(el);
      setSeen(true);
    });
    io.observe(el);
    return () => io.unobserve(el);
  }, [ref, enabled, seen, margin]);
  return seen;
}

/** Blocca lo scroll della pagina sotto un overlay e ripristina la posizione alla chiusura. */
export function useScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const y = window.scrollY;
    const style = document.body.style;
    Object.assign(style, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', overflow: 'hidden' });
    return () => {
      Object.assign(style, { position: '', top: '', left: '', right: '', overflow: '' });
      window.scrollTo(0, y);
    };
  }, [active]);
}

/** Header compatto oltre 120px di scroll, espanso sotto 50px (isteresi contro lo sfarfallio). */
export function useScrolledHeader(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setScrolled((prev) => (prev ? y >= 50 : y > 120));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return scrolled;
}

/** Esegue il callback alla pressione di Esc finche' `active` e' vero. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

/** Porta la sezione di una sottocategoria sotto l'header fisso. */
export function scrollToSection(subId: string, smooth = true) {
  const go = (behavior: ScrollBehavior) => {
    const el = document.getElementById(`section-${subId}`);
    if (!el) return false;
    const header = document.querySelector<HTMLElement>('.top-bar')?.offsetHeight ?? 0;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - header - 14);
    if (Math.abs(top - window.scrollY) < 3) return false;
    window.scrollTo({ top, behavior });
    return true;
  };
  const animate = smooth && !document.body.classList.contains('perf-lite');
  if (!go(animate ? 'smooth' : 'instant')) return;
  // durante lo scorrimento l'header si compatta e cambia altezza: correzione finale
  let done = false;
  const fix = () => {
    if (!done) go('smooth');
    done = true;
  };
  if ('onscrollend' in window) window.addEventListener('scrollend', fix, { once: true });
  setTimeout(fix, animate ? 1200 : 80);
}

/** Dissolvenza in entrata degli elementi `.reveal` quando entrano nello schermo. */
export function useReveal(rootRef: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('.reveal:not(.in)') ?? []);
    if (typeof IntersectionObserver === 'undefined') return void items.forEach((el) => el.classList.add('in'));
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps);
}
