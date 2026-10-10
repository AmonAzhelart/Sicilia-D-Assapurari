import { useCallback, useEffect, useRef, useState } from 'react';
import { faChevronLeft, faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { cx } from '../lib/hooks';
import { edgeBackground, needsProcessing, surfaceStyle, useProcessedImage } from '../lib/images';
import { Icon } from './Icon';

const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;

/** Foto a tutto schermo: pinch/rotella per lo zoom, doppio tap, trascinamento, swipe e frecce per scorrere. */
export function ImageViewer({ images, modes, start, onClose }: {
  images: string[]; modes: Array<string | undefined>; start: number; onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.min(start, images.length - 1));
  const [loaded, setLoaded] = useState(false);
  const [gesture, setGesture] = useState<'' | 'dragging' | 'pinching'>('');
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const t = useRef({ scale: 1, x: 0, y: 0 });
  const result = useProcessedImage(images[index], modes[index], 'viewer', true, true);
  const photo = !!result?.surface.photo;
  const full = !needsProcessing(modes[index]);
  const [edge, setEdge] = useState<string | undefined>();
  const shownEdge = full ? edge : undefined;
  const total = images.length;

  const apply = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;
    const s = t.current;
    if (s.scale <= 1.01) Object.assign(s, { scale: 1, x: 0, y: 0 });
    const maxX = Math.max(0, (img.offsetWidth * s.scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * s.scale - stage.clientHeight) / 2);
    s.x = Math.max(-maxX, Math.min(maxX, s.x));
    s.y = Math.max(-maxY, Math.min(maxY, s.y));
    img.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.scale})`;
  }, []);

  /** Zoom mantenendo fermo il punto (clientX, clientY) sotto il dito/cursore. */
  const zoomAt = useCallback((scale: number, clientX?: number, clientY?: number) => {
    const s = t.current;
    const next = Math.max(1, Math.min(MAX_SCALE, scale));
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect && clientX !== undefined && clientY !== undefined) {
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      s.x = px - (px - s.x) * (next / s.scale);
      s.y = py - (py - s.y) * (next / s.scale);
    }
    s.scale = next;
    apply();
  }, [apply]);

  const go = useCallback((dir: -1 | 1) => {
    if (total > 1) setIndex((i) => (i + dir + total) % total);
  }, [total]);

  // nuova immagine: zoom azzerato
  useEffect(() => {
    t.current = { scale: 1, x: 0, y: 0 };
    setLoaded(false);
    setEdge(undefined);
    apply();
  }, [index, apply]);

  // "indietro" (browser/Android) chiude il visualizzatore
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    history.pushState({ ...history.state, viewer: true }, '');
    const onPop = () => onCloseRef.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (history.state?.viewer) history.back();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // rotella / trackpad: zoom verso il cursore
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(t.current.scale * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // gesti touch/mouse unificati con Pointer Events
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef({ mode: '' as '' | 'pan' | 'pinch', startX: 0, startY: 0, originX: 0, originY: 0, dist: 1, base: 1, moved: false, lastTap: 0 });
  const distance = () => {
    const [a, b] = Array.from(pointers.current.values());
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };

  const lastPointerType = useRef('');
  const onPointerDown = (e: React.PointerEvent) => {
    lastPointerType.current = e.pointerType;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = g.current;
    if (pointers.current.size === 2) {
      Object.assign(s, { mode: 'pinch', dist: distance(), base: t.current.scale });
      setGesture('pinching');
    } else if (pointers.current.size === 1) {
      Object.assign(s, { mode: 'pan', startX: e.clientX, startY: e.clientY, originX: t.current.x, originY: t.current.y, moved: false });
      setGesture('dragging');
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = g.current;
    if (s.mode === 'pinch' && pointers.current.size >= 2) {
      t.current.scale = Math.max(1, Math.min(MAX_SCALE, s.base * (distance() / s.dist)));
      apply();
    } else if (s.mode === 'pan') {
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) s.moved = true;
      if (t.current.scale > 1.01) {
        t.current.x = s.originX + dx;
        t.current.y = s.originY + dy;
        apply();
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const s = g.current;
    if (s.mode === 'pinch') {
      if (pointers.current.size < 2) {
        s.mode = '';
        setGesture('');
        apply();
      }
      return;
    }
    if (s.mode !== 'pan') return;
    s.mode = '';
    setGesture('');
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.moved) {
      if (e.pointerType === 'mouse') return; // col mouse lo zoom e' sul doppio clic
      const now = Date.now();
      if (now - s.lastTap < DOUBLE_TAP_MS) {
        zoomAt(t.current.scale > 1.2 ? 1 : 2.5, e.clientX, e.clientY);
        s.lastTap = 0;
      } else s.lastTap = now;
      return;
    }
    if (t.current.scale <= 1.01 && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 55) go(dx > 0 ? -1 : 1);
  };

  return (
    <div className={cx('image-viewer-overlay open', gesture)} role="dialog" aria-modal="true" aria-label="Immagine prodotto">
      <div className="image-viewer-shell">
        <button type="button" className="image-viewer-close" onClick={onClose} aria-label="Chiudi immagine">
          <Icon icon={faXmark} />
        </button>
        {total > 1 && (
          <button type="button" className="image-viewer-nav prev" onClick={() => go(-1)} aria-label="Immagine precedente">
            <Icon icon={faChevronLeft} />
          </button>
        )}
        <div ref={stageRef} className={cx('image-viewer-stage', photo && 'has-photo-bg')} style={surfaceStyle(result?.surface, shownEdge)}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            // su touch il doppio tap e' gia' gestito da onPointerUp
            if (lastPointerType.current === 'mouse') zoomAt(t.current.scale > 1.2 ? 1 : 2.5, e.clientX, e.clientY);
          }}>
          <div className="image-light-backdrop" style={photo ? { opacity: 0 } : undefined} />
          <img ref={imgRef} key={result?.src} className="image-viewer-img" src={result?.src} alt={`Immagine ${index + 1} di ${total}`}
            draggable={false} style={{ opacity: loaded ? 1 : 0 }} onLoad={(e) => { if (full) setEdge(edgeBackground(images[index], e.currentTarget, stageRef.current)); setLoaded(true); }} />
        </div>
        {total > 1 && (
          <button type="button" className="image-viewer-nav next" onClick={() => go(1)} aria-label="Immagine successiva">
            <Icon icon={faChevronRight} />
          </button>
        )}
        <div className="image-viewer-counter">{index + 1} / {total}</div>
      </div>
    </div>
  );
}
