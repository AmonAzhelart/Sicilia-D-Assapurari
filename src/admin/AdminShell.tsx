import { useEffect, useState } from 'react';
import { faCloudArrowUp, faEye, faPenToSquare, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { App } from '../App';
import { Icon } from '../components/Icon';
import { AdminContext } from '../lib/admin';
import { cx } from '../lib/hooks';
import { useStore } from '../lib/store';
import { adminApi, dirtyStore, loadAdminCatalog, logout, menuStore, save } from './actions';
import { DialogHost } from './dialogs';

export function AdminShell() {
  const [preview, setPreview] = useState(false);
  const dirty = useStore(dirtyStore);
  const menuOpen = useStore(menuStore);

  // avviso alla chiusura della pagina con modifiche non salvate
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Ctrl/Cmd + S salva
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // il menu si chiude cliccando altrove (i pulsanti che lo aprono lo gestiscono da se')
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!target.closest('.fab-menu, [aria-label="Menu admin"], .nav-item')) menuStore.set(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  return (
    <AdminContext.Provider value={preview ? null : adminApi}>
      <App load={loadAdminCatalog} base="/admin" dirty={dirty} />
      {preview ? (
        <button type="button" className="back-to-edit" onClick={() => setPreview(false)}
          title="Torna alla modalità modifica" aria-label="Torna alla modalità modifica">
          <Icon icon={faPenToSquare} />
        </button>
      ) : (
        <div className={cx('fab-menu', menuOpen && 'active')} inert={!menuOpen}>
          <button type="button" className="fab-item" onClick={save} title="Ctrl+S">
            <Icon icon={faCloudArrowUp} /> Salva su GitLab {dirty && <span className="dirty-dot" />}
          </button>
          <button type="button" className="fab-item muted" onClick={() => { menuStore.set(false); setPreview(true); }}>
            <Icon icon={faEye} /> Anteprima cliente
          </button>
          <button type="button" className="fab-item muted" onClick={logout}>
            <Icon icon={faRightFromBracket} /> Esci
          </button>
        </div>
      )}
      <DialogHost />
    </AdminContext.Provider>
  );
}
