import {
  faArrowLeft, faArrowRight, faBagShopping, faHouse, faMagnifyingGlass, faShieldHalved, faSliders, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Catalog, Macro } from '../types';
import { splitTitle } from '../lib/catalog';
import { cx, useScrolledHeader } from '../lib/hooks';
import { useAdmin } from '../lib/admin';
import { selectionStore } from '../lib/personal';
import { useNav } from '../lib/router';
import { sectionStore, useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Icon } from './Icon';
import { AdminIconButton, ScrollRow } from './ui';

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
  const sections = useStore(sectionStore);
  const pieces = Object.values(useStore(selectionStore)).reduce((n, q) => n + q, 0);
  const [eyebrow, wordmark] = splitTitle(catalog.title || "SICILIA D'ASSAPURARI");
  // sottocategoria evidenziata: quella in vista durante lo scorrimento
  const activeSub = sections.active ?? subId;
  const subs = macro?.subcategories.filter((s) => !sections.visible || sections.visible.includes(s.id)) ?? [];

  const addMacro = async () => {
    const id = await admin?.addMacro();
    if (id) nav.selectMacro(id);
  };
  const addSub = async () => {
    if (!macro) return void toast('Seleziona prima una macro categoria.', 'info');
    const id = await admin?.addSub(macro.id);
    if (id) nav.selectSub(id);
  };
  const badge = pieces > 0 && <span className="count-badge" aria-hidden="true">{pieces > 99 ? '99+' : pieces}</span>;
  const bagLabel = pieces ? `La tua selezione: ${pieces} pezzi` : 'La tua selezione';

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
            {!admin && (
              <button type="button" className="nav-item nav-bag" onClick={nav.openSelection} aria-label={bagLabel}>
                <Icon icon={faBagShopping} /> <span>Selezione</span>{badge}
              </button>
            )}
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
          {!admin && (
            <button type="button" className="icon-btn" onClick={nav.openSelection} aria-label={bagLabel}>
              <Icon icon={faBagShopping} />{badge}
            </button>
          )}
          {admin && (
            <>
              <button type="button" className="icon-btn" onClick={admin.toggleMenu} aria-label="Menu admin" title="Menu admin">
                <Icon icon={faShieldHalved} />
                {dirty && <span className="dirty-dot" />}
              </button>
              <button type="button" className="icon-btn settings-btn" onClick={admin.editSettings} aria-label="Impostazioni" title="Impostazioni">
                <Icon icon={faSliders} />
              </button>
            </>
          )}
        </div>
      </div>

      <ScrollRow wrapperClass="cat-scroller-wrapper" scrollerClass="cat-scroller" label="macro categorie"
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
      </ScrollRow>

      {macro && subs.length > 0 && (
        <ScrollRow key={macro.id} wrapperClass="sub-scroller-wrapper" scrollerClass="sub-scroller" label="sottocategorie" activeKey={activeSub}>
          {subs.map((sub) => (
            <button key={sub.id} type="button" className={cx('chip sub-chip', sub.id === activeSub && 'active')}
              data-active={sub.id === activeSub || undefined} aria-current={sub.id === activeSub ? 'location' : undefined}
              onClick={() => nav.selectSub(sub.id)}
              onDoubleClick={admin ? () => admin.renameSub(macro.id, sub.id) : undefined}>
              {sub.name}
            </button>
          ))}
        </ScrollRow>
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
