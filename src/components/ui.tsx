import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-common-types';
import { faChevronLeft, faChevronRight, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { cx, useInView } from '../lib/hooks';
import { edgeFill, needsProcessing, surfaceStyle, useProcessedImage, type Variant } from '../lib/images';
import { toastStore } from '../lib/toast';
import { useStore } from '../lib/store';
import { Icon } from './Icon';

/* ---------- Immagine prodotto con fondo adattivo ---------- */

interface MediaProps {
  className: string;
  imgClassName: string;
  src: string;
  mode?: string;
  variant: Variant;
  eager?: boolean;
  alt?: string;
  placeholder?: ReactNode;
  onImageClick?: () => void;
}

export function Media({ className, imgClassName, src, mode, variant, eager, alt = '', placeholder, onImageClick }: MediaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lazy = !!src && !eager && needsProcessing(mode);
  const inView = useInView(ref, lazy);
  const result = useProcessedImage(src, mode, variant, !lazy || inView, eager);
  const photo = !!result?.surface.photo;
  // foto "Full Screen": sempre intera, sul colore dei suoi bordi o sulla propria copia sfocata
  const full = !!src && !needsProcessing(mode);
  const fill = full ? edgeFill(src) : undefined;
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  return (
    <div ref={ref} className={cx(className, photo && 'has-photo-bg', full && 'is-full')} style={surfaceStyle(result?.surface, full, fill)}>
      <div className="image-light-backdrop" style={photo ? { opacity: 0 } : undefined} />
      {fill === null && <FadeImg key={`b${src}`} className="media-blur" src={src} eager alt="" />}
      {src ? (
        <FadeImg key={result?.src} className={imgClassName} src={result?.src} eager={eager} alt={alt} onClick={onImageClick}
          onLoaded={full && fill === undefined ? (img) => { edgeFill(src, img); refresh(); } : undefined} />
      ) : placeholder}
    </div>
  );
}

export function FadeImg({ src, className, eager, alt, onClick, onLoaded }: {
  src?: string; className: string; eager?: boolean; alt: string; onClick?: () => void; onLoaded?: (img: HTMLImageElement) => void;
}) {
  // 0 finche' non e' caricata; poi il rapporto reale, con cui le foto intere si adattano al riquadro (CSS --ar)
  const [ratio, setRatio] = useState(0);
  return (
    <img className={className} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async"
      fetchPriority={eager ? 'high' : 'low'} draggable={false}
      onLoad={(e) => {
        onLoaded?.(e.currentTarget);
        setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1);
      }}
      style={ratio ? { opacity: 1, '--ar': ratio } as CSSProperties : undefined} onClick={onClick} />
  );
}

/* ---------- Link "a blocco" ---------- */

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * Elemento cliccabile con URL reale (apri in nuova scheda, condividi, tasto centrale).
 * In admin contiene pulsanti, quindi diventa un div con ruolo link (niente controlli annidati in <a>).
 */
export function LinkBox({ href, onOpen, asDiv, className, label, style, children }: {
  href: string; onOpen: () => void; asDiv?: boolean; className: string; label?: string; style?: React.CSSProperties; children: ReactNode;
}) {
  if (asDiv) {
    return (
      <div className={className} style={style} role="link" tabIndex={0} aria-label={label} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); }}>
        {children}
      </div>
    );
  }
  return (
    <a className={className} style={style} href={href} aria-label={label}
      onClick={(e) => { if (isPlainClick(e)) { e.preventDefault(); onOpen(); } }}>
      {children}
    </a>
  );
}

/** Pulsante icona admin che non propaga il click al contenitore (card, chip...). */
export function AdminIconButton({ icon, title, onClick, danger, className = 'admin-icon-btn', style }: {
  icon: IconDefinition; title: string; onClick: () => void; danger?: boolean; className?: string; style?: React.CSSProperties;
}) {
  return (
    <button type="button" className={cx(className, danger && 'danger')} title={title} aria-label={title} style={style}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}>
      <Icon icon={icon} />
    </button>
  );
}

/* ---------- Loader iniziale ---------- */

export function Loader({ ready, error, onRetry }: { ready: boolean; error: string | null; onRetry: () => void }) {
  const [progress, setProgress] = useState(8);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setProgress(70));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!ready) return;
    setProgress(100);
    const timer = setTimeout(() => setGone(true), 1100);
    return () => clearTimeout(timer);
  }, [ready]);
  if (gone) return null;

  return (
    <div id="loader" aria-busy={!ready} aria-live="polite"
      style={ready ? { opacity: 0, visibility: 'hidden', pointerEvents: 'none', transitionDelay: '0.4s' } : undefined}>
      <div className="loader-logo" style={error ? { animation: 'none' } : undefined}>
        <span className="loader-eyebrow">SICILIA</span>
        <div className="loader-rule" />
        <span className="loader-wordmark">D'ASSAPURARI</span>
        <span className="loader-tagline">Catalogo Digitale</span>
      </div>
      {error ? (
        <div className="loader-error" role="alert">
          <span>{error}</span>
          <button type="button" className="loader-retry" onClick={onRetry}>
            <Icon icon={faRotateRight} /> Riprova
          </button>
        </div>
      ) : (
        <div className="loader-bar">
          <div className="loader-prog" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

/* ---------- Notifiche ---------- */

export function Toasts() {
  const toasts = useStore(toastStore);
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
    </div>
  );
}

/* ---------- Riga scorrevole orizzontale (chip, rail di prodotti) ---------- */

interface ScrollRowProps {
  wrapperClass: string;
  scrollerClass: string;
  label: string;
  activeKey?: string;
  trackScrolled?: boolean;
  children: ReactNode;
}

export function ScrollRow({ wrapperClass, scrollerClass, label, activeKey, trackScrolled, children }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ can: false, atStart: true, atEnd: true, scrolled: false });

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const next = { can: max > 6, atStart: el.scrollLeft <= 4, atEnd: el.scrollLeft >= max - 4, scrolled: el.scrollLeft > 5 };
    setState((prev) => (prev.can === next.can && prev.atStart === next.atStart && prev.atEnd === next.atEnd
      && prev.scrolled === next.scrolled ? prev : next));
  }, []);

  useLayoutEffect(sync);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(el);

    // desktop: rotella verticale -> scorrimento orizzontale, trascinamento col mouse
    const onWheel = (e: WheelEvent) => {
      if (window.innerWidth < 1024 || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth + 4) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    let drag: { x: number; left: number; moved: boolean } | null = null;
    let suppressClick = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || window.innerWidth < 1024 || el.scrollWidth <= el.clientWidth + 4) return;
      drag = { x: e.clientX, left: el.scrollLeft, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const delta = e.clientX - drag.x;
      if (!drag.moved && Math.abs(delta) > 4) {
        drag.moved = true;
        el.classList.add('is-dragging');
        document.body.classList.add('dragging-chip-scroller');
      }
      if (drag.moved) el.scrollLeft = drag.left - delta;
    };
    const onUp = () => {
      if (!drag) return;
      suppressClick = drag.moved;
      drag = null;
      el.classList.remove('is-dragging');
      document.body.classList.remove('dragging-chip-scroller');
      setTimeout(() => { suppressClick = false; }, 0);
    };
    const onClickCapture = (e: Event) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onClickCapture, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      observer?.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [sync]);

  // porta il chip attivo al centro della barra
  useEffect(() => {
    const el = ref.current;
    const chip = el?.querySelector<HTMLElement>('[data-active]');
    if (!el || !chip) return;
    const smooth = !document.body.classList.contains('perf-lite');
    el.scrollTo({ left: chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  }, [activeKey]);

  const scrollBy = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: Math.max(220, Math.round(el.clientWidth * 0.72)) * dir, behavior: 'smooth' });
  };

  return (
    <div className={cx(wrapperClass, trackScrolled && state.scrolled && 'scrolled')}>
      <div className={cx('horizontal-chip-shell', state.can && 'can-scroll')}>
        <button type="button" className={cx('chip-scroll-btn prev', !state.can && 'is-hidden')} disabled={!state.can || state.atStart}
          aria-label={`Scorri ${label} a sinistra`} onClick={() => scrollBy(-1)}>
          <Icon icon={faChevronLeft} />
        </button>
        <div ref={ref} className={cx(scrollerClass, state.can && 'can-drag')} onScroll={sync} role="toolbar" aria-label={label}>
          {children}
        </div>
        <button type="button" className={cx('chip-scroll-btn next', !state.can && 'is-hidden')} disabled={!state.can || state.atEnd}
          aria-label={`Scorri ${label} a destra`} onClick={() => scrollBy(1)}>
          <Icon icon={faChevronRight} />
        </button>
      </div>
    </div>
  );
}
