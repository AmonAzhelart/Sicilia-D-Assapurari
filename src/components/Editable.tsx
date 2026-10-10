import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementType, type HTMLAttributes } from 'react';
import {
  faBold, faEraser, faItalic, faListOl, faListUl, faUnderline,
} from '@fortawesome/free-solid-svg-icons';
import { sanitizeHtml } from '../lib/sanitize';
import { Icon } from './Icon';

interface EditableProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  value: string;
  /** Senza onChange il contenuto e' in sola lettura (sito pubblico). */
  onChange?: (value: string) => void;
  html?: boolean;
  as?: ElementType;
  placeholder?: string;
  singleLine?: boolean;
}

/**
 * Testo modificabile in linea. Il DOM viene aggiornato solo se differisce dal valore,
 * cosi' il cursore non salta mentre si scrive.
 */
export function Editable({ value, onChange, html, as: Tag = 'div', placeholder, singleLine, ...rest }: EditableProps) {
  const ref = useRef<HTMLElement>(null);
  // in sola lettura via anche le righe vuote finali (mentre si scrive servono)
  const safe = useMemo(() => (html ? sanitizeHtml(value, !onChange) : value), [html, value, !onChange]);
  // textContent ignora il text-transform CSS: i campi in maiuscoletto si salvano come digitati
  const read = (el: HTMLElement) => (html ? el.innerHTML : singleLine ? el.textContent ?? '' : el.innerText);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !onChange || read(el) === safe) return;
    if (html) el.innerHTML = safe;
    else if (singleLine) el.textContent = safe;
    else el.innerText = safe;
  }, [safe, html, singleLine, onChange]);

  if (!onChange) {
    return html ? <Tag {...rest} dangerouslySetInnerHTML={{ __html: safe }} /> : <Tag {...rest}>{value}</Tag>;
  }

  return (
    <Tag
      {...rest}
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={html}
      data-placeholder={placeholder}
      onInput={(e: React.FormEvent<HTMLElement>) => onChange(read(e.currentTarget))}
      onPaste={(e: React.ClipboardEvent<HTMLElement>) => {
        // incolla solo testo: niente stili/markup estranei da Word o dal web
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      // spazi iniziali/finali tolti all'uscita dal campo, non durante la digitazione (il cursore non salta)
      onBlur={singleLine ? (e: React.FocusEvent<HTMLElement>) => {
        const text = read(e.currentTarget);
        if (text !== text.trim()) onChange(text.trim());
      } : undefined}
      onKeyDown={singleLine ? (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      } : undefined}
    />
  );
}

const FONT_SIZES = [['1', 'Piccolo'], ['3', 'Normale'], ['5', 'Grande'], ['6', 'Enorme']];

/** Descrizione/abbinamenti: HTML in lettura, editor con barra di formattazione in admin. */
export function RichText({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setActive(false);
    };
    const onSelection = () => {
      const sel = document.getSelection();
      const editor = wrapRef.current?.querySelector('.rte-content');
      if (sel?.rangeCount && editor?.contains(sel.anchorNode)) rangeRef.current = sel.getRangeAt(0);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('selectionchange', onSelection);
    };
  }, [active]);

  if (!onChange) return <Editable className="rte-content" html value={value} />;

  const exec = (command: string, arg?: string) => {
    const editor = wrapRef.current?.querySelector<HTMLElement>('.rte-content');
    if (!editor) return;
    editor.focus({ preventScroll: true });
    const sel = document.getSelection();
    if (rangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(rangeRef.current);
    }
    document.execCommand(command, false, arg);
    onChange(editor.innerHTML);
  };
  const keepFocus = (e: React.PointerEvent) => e.preventDefault();
  const button = (command: string, title: string, icon: typeof faBold) => (
    <button type="button" className="rte-btn" title={title} aria-label={title} onPointerDown={keepFocus} onClick={() => exec(command)}>
      <Icon icon={icon} />
    </button>
  );

  return (
    <div ref={wrapRef}>
      {active && (
        <div className="rte-toolbar active" role="toolbar" aria-label="Formattazione testo">
          {button('bold', 'Grassetto', faBold)}
          {button('italic', 'Corsivo', faItalic)}
          {button('underline', 'Sottolineato', faUnderline)}
          <div className="rte-separator" />
          <select className="rte-select" defaultValue="" aria-label="Dimensione testo"
            onChange={(e) => { exec('fontSize', e.target.value); e.target.value = ''; }}>
            <option value="">Dimensione</option>
            {FONT_SIZES.map(([size, label]) => <option key={size} value={size}>{label}</option>)}
          </select>
          <input type="color" className="rte-color-picker" title="Colore testo" aria-label="Colore testo"
            onChange={(e) => exec('foreColor', e.target.value)} />
          <div className="rte-separator" />
          {button('insertUnorderedList', 'Elenco', faListUl)}
          {button('insertOrderedList', 'Elenco numerato', faListOl)}
          <div className="rte-separator" />
          {button('removeFormat', 'Pulisci formattazione', faEraser)}
        </div>
      )}
      <Editable className="rte-content" html value={value} onChange={onChange} onFocus={() => setActive(true)} />
    </div>
  );
}
