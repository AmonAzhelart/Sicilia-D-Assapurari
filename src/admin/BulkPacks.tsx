// Pack su piu' prodotti in un colpo: si scelgono categorie, sottocategorie o singoli prodotti
// e si applicano a tutti gli stessi pack (es. 3 pezzi -5%, 6 pezzi -10%).
import { useEffect, useRef, useState } from 'react';
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Pack, Scope } from '../types';
import { Icon } from '../components/Icon';
import { ScopePicker } from '../components/Promo';
import { AdminIconButton } from '../components/ui';
import { scopeIds } from '../lib/catalog';
import { cleanPacks } from '../lib/pricing';
import { catalogStore, createStore, useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { setPacksOf } from './actions';

export const bulkPacksStore = createStore(false);

const toInt = (value: string, max: number) =>
  value.trim() === '' ? 0 : Math.min(max, Math.max(0, Math.round(Number(value)) || 0));

export function BulkPacks() {
  return useStore(bulkPacksStore) ? <BulkPacksDialog onClose={() => bulkPacksStore.set(false)} /> : null;
}

function BulkPacksDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const catalog = useStore(catalogStore);
  const [scope, setScope] = useState<Scope>({ ids: [] });
  const [packs, setPacks] = useState<Pack[]>([{ qty: 3, discount: 5 }, { qty: 6, discount: 10 }]);
  useEffect(() => ref.current?.showModal(), []);
  if (!catalog) return null;

  const ids = scopeIds(catalog, scope);
  const valid = cleanPacks(packs);
  const setPack = (i: number, patch: Partial<Pack>) => setPacks(packs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const apply = () => {
    setPacksOf(ids, valid);
    toast(`${valid.length ? 'Pack aggiornati' : 'Pack tolti'} su ${ids.length === 1 ? '1 prodotto' : `${ids.length} prodotti`}. Ricordati di salvare.`);
    onClose();
  };

  return (
    <dialog ref={ref} className="ui-dialog" aria-label="Pack su più prodotti"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="img-mode-dialog bulk-form">
        <div className="img-mode-title">Pack su più prodotti</div>
        <div className="img-mode-sub">Scegli i prodotti, imposta i pack e applicali a tutti in un colpo.</div>

        <h4 className="sheet-section-title">1. Prodotti</h4>
        <ScopePicker scope={scope} onChange={(patch) => setScope({ ...scope, ...patch })} />

        <h4 className="sheet-section-title">2. Pack</h4>
        <div className="pack-list">
          {packs.map((pack, i) => (
            <div key={i} className="pack-item">
              <label className="pack-qty">
                <input type="number" min={2} max={999} step={1} inputMode="numeric" aria-label="Pezzi nel pack"
                  value={pack.qty || ''} onChange={(e) => setPack(i, { qty: toInt(e.target.value, 999) })} />
                <span>pezzi</span>
              </label>
              <div className="pack-prices">
                <span>{pack.qty >= 2 ? 'Sconto' : 'Minimo 2 pezzi'}</span>
              </div>
              <label className="offer-field compact">
                <input type="number" min={0} max={99} step={1} inputMode="numeric" placeholder="0" aria-label="Sconto pack"
                  value={pack.discount || ''} onChange={(e) => setPack(i, { discount: toInt(e.target.value, 99) })} />
                <em>%</em>
              </label>
              <AdminIconButton icon={faXmark} title="Elimina pack" danger onClick={() => setPacks(packs.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
        <div className="sheet-admin-actions">
          <button type="button" className="sheet-admin-btn" onClick={() => setPacks([...packs, { qty: 12, discount: 15 }])}>
            <Icon icon={faPlus} /><span>AGGIUNGI PACK</span>
          </button>
        </div>
        <p className="promo-form-note">
          Questi pack sostituiscono quelli che i prodotti hanno già; senza pack li togli. Le modifiche vanno online quando salvi.
        </p>

        <div className="img-mode-choices">
          <button type="button" className="img-mode-btn" onClick={onClose}>Annulla</button>
          <button type="button" className="img-mode-btn primary" disabled={!ids.length} onClick={apply}>
            {!ids.length ? 'Scegli i prodotti' : `${valid.length ? 'Applica a' : 'Togli i pack da'} ${ids.length === 1 ? '1 prodotto' : `${ids.length} prodotti`}`}
          </button>
        </div>
      </div>
    </dialog>
  );
}
