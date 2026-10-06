import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-common-types';
import { faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { cx, useInView } from '../lib/hooks';
import { needsProcessing, surfaceStyle, useProcessedImage, type Variant } from '../lib/images';
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
  onSurface?: (photo: boolean) => void;
  onImageClick?: () => void;
}

export function Media({ className, imgClassName, src, mode, variant, eager, alt = '', placeholder, onSurface, onImageClick }: MediaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lazy = !!src && !eager && needsProcessing(mode);
  const inView = useInView(ref, lazy);
  const result = useProcessedImage(src, mode, variant, !lazy || inView, eager);
  const photo = !!result?.surface.photo;
  const onSurfaceRef = useRef(onSurface);
  onSurfaceRef.current = onSurface;
  useEffect(() => onSurfaceRef.current?.(photo), [photo]);

  return (
    <div ref={ref} className={cx(className, photo && 'has-photo-bg')} style={surfaceStyle(result?.surface)}>
      <div className="image-light-backdrop" style={photo ? { opacity: 0 } : undefined} />
      {src ? <FadeImg key={result?.src} className={imgClassName} src={result?.src} eager={eager} alt={alt} onClick={onImageClick} /> : placeholder}
    </div>
  );
}

function FadeImg({ src, className, eager, alt, onClick }: { src?: string; className: string; eager?: boolean; alt: string; onClick?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img className={className} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async"
      fetchPriority={eager ? 'high' : 'low'} draggable={false} onLoad={() => setLoaded(true)}
      style={loaded ? { opacity: 1 } : undefined} onClick={onClick} />
  );
}

/* ---------- Link "a blocco" ---------- */

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * Elemento cliccabile con URL reale (apri in nuova scheda, condividi, tasto centrale).
 * In admin contiene pulsanti, quindi diventa un div con ruolo link (niente controlli annidati in <a>).
 */
export function LinkBox({ href, onOpen, asDiv, className, label, children }: {
  href: string; onOpen: () => void; asDiv?: boolean; className: string; label?: string; children: ReactNode;
}) {
  if (asDiv) {
    return (
      <div className={className} role="link" tabIndex={0} aria-label={label} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); }}>
        {children}
      </div>
    );
  }
  return (
    <a className={className} href={href} aria-label={label}
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
