import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  faArrowLeft, faArrowRight, faChevronLeft, faChevronRight, faHouse, faMagnifyingGlass, faShieldHalved, faSliders, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Catalog, Macro } from '../types';
import { splitTitle } from '../lib/catalog';
import { cx, useScrolledHeader } from '../lib/hooks';
import { useAdmin } from '../lib/admin';
import { useNav } from '../lib/router';
import { toast } from '../lib/toast';
import { Icon } from './Icon';
import { AdminIconButton } from './ui';

interface HeaderProps {
  catalog: Catalog;
  macro?: Macro;
  subId?: string;
  dirty?: boolean;
}

export function Header({ catalog, macro, subId, dirty }: HeaderProps) {
  const nav = useNav();
  const admin = useAdmin();
  const scrolled = useScrolledHeader();
  const [eyebrow, wordmark] = splitTitle(catalog.title || "SICILIA D'ASSAPURARI");

  const addMacro = async () => {
    const id = await admin?.addMacro();
    if (id) nav.selectMacro(id);
  };
  const addSub = async () => {
    if (!macro) return void toast('Seleziona prima una macro categoria.', 'info');
    const id = await admin?.addSub(macro.id);
    if (id) nav.selectSub(id);
  };

  return (
    <header className={cx('top-bar', scrolled && 'scrolled')}>
      <div className="header-main">
        <a className="brand" href={nav.href({})} aria-label="Home catalogo"
          onClick={(e) => { e.preventDefault(); nav.goHome(); }}>
          <span className="brand-eyebrow">{eyebrow}</span>
          <span className="brand-divider" />
          <span className="brand-wordmark">{wordmark}</span>
        </a>
        <div className="header-actions">
          <nav className="desktop-nav" aria-label="Navigazione principale">
            <button type="button" className={cx('nav-item', !macro && 'active')} onClick={nav.goHome}>
              <Icon icon={faHouse} /> <span>Home</span>
            </button>
            <button type="button" className="nav-item" onClick={nav.openSearch}>
              <Icon icon={faMagnifyingGlass} /> <span>Cerca</span>
            </button>
            {admin && (
              <button type="button" className="nav-item" style={{ color: 'var(--accent)' }} onClick={admin.toggleMenu}>
                <Icon icon={faShieldHalved} /> <span>Admin</span>
                {dirty && <span className="dirty-dot" style={{ display: 'block' }} />}
              </button>
            )}
          </nav>
          <button type="button" className="icon-btn" onClick={nav.openSearch} aria-label="Cerca">
            <Icon icon={faMagnifyingGlass} />
          </button>
          {admin && (
            <>
              <button type="button" className="icon-btn" onClick={admin.toggleMenu} aria-label="Menu admin" title="Menu admin">
                <Icon icon={faShieldHalved} />
                {dirty && <span className="dirty-dot" />}
              </button>
              <button type="button" className="icon-btn settings-btn" onClick={admin.editTitle} aria-label="Nome catalogo" title="Nome catalogo">
                <Icon icon={faSliders} />
              </button>
            </>
          )}
        </div>
      </div>

      <ChipScroller wrapperClass="cat-scroller-wrapper" scrollerClass="cat-scroller" label="macro categorie"
        activeKey={macro?.id} trackScrolled>
        {admin && (
          <>
            <button type="button" className="chip" onClick={addMacro}
              style={{ background: 'var(--primary)', color: 'var(--bg-page)', borderColor: 'var(--primary)' }}>+ MACRO</button>
            <button type="button" className="chip" onClick={addSub}
              style={{ background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }}>+ SUB</button>
          </>
        )}
        {catalog.macros.map((m) => <MacroChip key={m.id} macro={m} active={m.id === macro?.id} />)}
      </ChipScroller>

      {macro && macro.subcategories.length > 0 && (
        <ChipScroller key={macro.id} wrapperClass="sub-scroller-wrapper" scrollerClass="sub-scroller" label="sottocategorie" activeKey={subId}>
          {macro.subcategories.map((sub) => (
            <button key={sub.id} type="button" className={cx('chip sub-chip', sub.id === subId && 'active')}
              data-active={sub.id === subId || undefined} aria-pressed={sub.id === subId}
              onClick={() => nav.selectSub(sub.id)}
              onDoubleClick={admin ? () => admin.renameSub(macro.id, sub.id) : undefined}>
              {sub.name}
            </button>
          ))}
        </ChipScroller>
      )}
    </header>
  );
}

function MacroChip({ macro, active }: { macro: Macro; active: boolean }) {
  const nav = useNav();
  const admin = useAdmin();
  const select = () => nav.selectMacro(macro.id);

  if (!admin) {
    return (
      <button type="button" className={cx('chip macro-chip', active && 'active')} data-active={active || undefined}
        aria-pressed={active} onClick={select}>
        <span className="chip-label">{macro.name}</span>
      </button>
    );
  }
  return (
    <div className={cx('chip macro-chip', active && 'active')} data-active={active || undefined} role="button" tabIndex={0}
      onClick={select} onKeyDown={(e) => { if (e.key === 'Enter') select(); }}
      onDoubleClick={() => admin.renameMacro(macro.id)} title="Doppio clic per rinominare">
      <span className="chip-label">{macro.name}</span>
      <span className="chip-admin-tools">
        <AdminIconButton icon={faArrowLeft} title="Sposta categoria a sinistra" onClick={() => admin.moveMacro(macro.id, -1)} />
        <AdminIconButton icon={faArrowRight} title="Sposta categoria a destra" onClick={() => admin.moveMacro(macro.id, 1)} />
        <AdminIconButton icon={faXmark} title="Elimina macro categoria" danger
          onClick={async () => { if (await admin.deleteMacro(macro.id)) nav.goHome(); }} />
      </span>
    </div>
  );
}

/* ---------- Barra di chip scorrevole ---------- */

interface ChipScrollerProps {
  wrapperClass: string;
  scrollerClass: string;
  label: string;
  activeKey?: string;
  trackScrolled?: boolean;
  children: ReactNode;
}

function ChipScroller({ wrapperClass, scrollerClass, label, activeKey, trackScrolled, children }: ChipScrollerProps) {
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
    const onClickCapture = (e: MouseEvent) => {
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
