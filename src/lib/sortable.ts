import { useEffect, useRef, type RefObject } from 'react';

/**
 * Riordino trascinando una maniglia. Funziona con mouse, touch e penna.
 * L'elemento segue il puntatore; al rilascio sopra un altro elemento chiama onMove(da, a).
 */
export function useSortable(
  containerRef: RefObject<HTMLElement | null>,
  options: { enabled: boolean; item: string; handle: string; onMove: (from: number, to: number) => void },
) {
  const onMoveRef = useRef(options.onMove);
  onMoveRef.current = options.onMove;
  const { enabled, item, handle } = options;

  useEffect(() => {
    const root = containerRef.current;
    if (!enabled || !root) return;
    const items = () => Array.from(root.children).filter((el): el is HTMLElement => el.matches(item));
    let drag: { el: HTMLElement; from: number; x: number; y: number; over: HTMLElement | null; pointer: number } | null = null;

    const onDown = (e: PointerEvent) => {
      const grip = (e.target as Element).closest(handle);
      const el = grip?.closest<HTMLElement>(item);
      if (!grip || !el || el.parentElement !== root || e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { el, from: items().indexOf(el), x: e.clientX, y: e.clientY, over: null, pointer: e.pointerId };
      el.classList.add('is-dragging');
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      e.preventDefault();
      drag.el.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px)`;
      const over = items().find((el) => {
        if (el === drag!.el) return false;
        const r = el.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }) ?? null;
      if (over !== drag.over) {
        drag.over?.classList.remove('drag-over');
        over?.classList.add('drag-over');
        drag.over = over;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      const { el, from, over } = drag;
      drag = null;
      el.classList.remove('is-dragging');
      el.style.transform = '';
      over?.classList.remove('drag-over');
      const to = over ? items().indexOf(over) : -1;
      if (to >= 0 && to !== from) onMoveRef.current(from, to);
    };
    const swallowClick = (e: MouseEvent) => {
      if ((e.target as Element).closest(handle)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('click', swallowClick, true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('click', swallowClick, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [containerRef, enabled, item, handle]);
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
