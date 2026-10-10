// Le descrizioni sono HTML scritto dall'admin e letto da un repository esterno:
// prima di inserirle nella pagina rimuoviamo tutto cio' che puo' eseguire codice.
const DROP = 'script,style,iframe,frame,frameset,object,embed,link,meta,base,form,input,button,textarea,select,svg,math,img,video,audio,source,template';

export function sanitizeHtml(html: string, trimEnd = false): string {
  if (!html) return '';
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll(DROP).forEach((el) => el.remove());
  tpl.content.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (
        name.startsWith('on') || name === 'srcdoc' || name === 'href' || name === 'src'
        || (name === 'style' && /url\s*\(|expression|javascript:/i.test(attr.value))
      ) el.removeAttribute(attr.name);
    }
  });
  if (trimEnd) trimTrailing(tpl.content);
  return tpl.innerHTML;
}

/** Righe vuote finali lasciate dall'editor (<div><br></div>, &nbsp;...), anche annidate. */
function trimTrailing(node: ParentNode) {
  let last = node.lastChild;
  while (last && !last.textContent?.trim()) {
    last.remove();
    last = node.lastChild;
  }
  if (last instanceof Element) trimTrailing(last);
}
