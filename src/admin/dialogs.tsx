// Finestre di dialogo dell'admin su <dialog> nativo (focus, Esc e accessibilita' gestiti dal browser).
import { useEffect, useRef, useState } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-common-types';
import { Icon } from '../components/Icon';
import { cx } from '../lib/hooks';
import { createStore, useStore } from '../lib/store';

interface Choice {
  value: string;
  label: string;
  icon?: IconDefinition;
  accent?: boolean;
}

type Spec =
  | { kind: 'prompt'; title: string; label?: string; value?: string; confirm?: string }
  | { kind: 'confirm'; title: string; message: string; danger?: boolean; confirm?: string }
  | { kind: 'choose'; title: string; message?: string; image?: string; options: Choice[] };

type Result = string | boolean | null;
const dialogStore = createStore<{ id: number; spec: Spec; resolve: (value: Result) => void } | null>(null);
let seq = 0;

const open = (spec: Spec) => new Promise<Result>((resolve) => dialogStore.set({ id: ++seq, spec, resolve }));

export const prompt = (spec: Omit<Extract<Spec, { kind: 'prompt' }>, 'kind'>) =>
  open({ kind: 'prompt', ...spec }) as Promise<string | null>;
export const confirm = (spec: Omit<Extract<Spec, { kind: 'confirm' }>, 'kind'>) =>
  open({ kind: 'confirm', ...spec }) as Promise<boolean>;
export const choose = (spec: Omit<Extract<Spec, { kind: 'choose' }>, 'kind'>) =>
  open({ kind: 'choose', ...spec }) as Promise<string | null>;

export function DialogHost() {
  const current = useStore(dialogStore);
  return current ? <DialogView key={current.id} spec={current.spec} resolve={current.resolve} /> : null;
}

function DialogView({ spec, resolve }: { spec: Spec; resolve: (value: Result) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(spec.kind === 'prompt' ? spec.value ?? '' : '');
  const cancelled: Result = spec.kind === 'confirm' ? false : null;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const finish = (result: Result) => {
    dialogStore.set(null);
    resolve(result);
  };

  return (
    <dialog ref={ref} className="ui-dialog" aria-label={spec.title}
      onCancel={(e) => { e.preventDefault(); finish(cancelled); }}
      onClick={(e) => { if (e.target === e.currentTarget) finish(cancelled); }}>
      <form className="img-mode-dialog" onSubmit={(e) => {
        e.preventDefault();
        finish(spec.kind === 'prompt' ? value : true);
      }}>
        {spec.kind === 'choose' && spec.image && <img className="img-mode-preview" src={spec.image} alt="Anteprima" />}
        <div className="img-mode-title">{spec.title}</div>
        {spec.kind !== 'prompt' && spec.message && <div className="img-mode-sub">{spec.message}</div>}

        {spec.kind === 'prompt' && (
          <label className="ui-dialog-field">
            {spec.label && <span>{spec.label}</span>}
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}

        {spec.kind === 'choose' && spec.options.some((o) => o.icon) ? (
          <div className="img-mode-choices">
            {spec.options.map((o) => (
              <button key={o.value} type="button" className={cx('img-mode-btn', o.accent && 'full')} onClick={() => finish(o.value)}>
                {o.icon && <Icon icon={o.icon} />}
                {o.label}
              </button>
            ))}
          </div>
        ) : spec.kind === 'choose' ? (
          <>
            <div className="ui-dialog-list">
              {spec.options.map((o) => (
                <button key={o.value} type="button" className="category-dropdown-item" onClick={() => finish(o.value)}>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
            <div className="img-mode-choices">
              <button type="button" className="img-mode-btn" onClick={() => finish(null)}>Annulla</button>
            </div>
          </>
        ) : (
          <div className="img-mode-choices">
            <button type="button" className="img-mode-btn" onClick={() => finish(cancelled)}>Annulla</button>
            <button type="submit" className={cx('img-mode-btn', spec.kind === 'confirm' && spec.danger ? 'danger' : 'primary')}>
              {spec.confirm ?? 'Conferma'}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
