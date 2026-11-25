// Operazioni dell'amministrazione sul catalogo (stato immutabile in catalogStore) e salvataggio su GitLab.
import { faImage } from '@fortawesome/free-regular-svg-icons';
import { faExpand } from '@fortawesome/free-solid-svg-icons';
import type { Catalog, Macro, Pack, Product } from '../types';
import type { AdminApi } from '../lib/admin';
import {
  CONFIG_FILE, dataImages, loadFromGitLab, macroFileName, normalizeProduct, productId, replaceStrings, serializeCatalog,
} from '../lib/catalog';
import { compressImage } from '../lib/images';
import { moveItem } from '../lib/sortable';
import { catalogStore, createStore } from '../lib/store';
import { toast } from '../lib/toast';
import { choose, confirm, prompt } from './dialogs';

export const menuStore = createStore(false);
export const dirtyStore = createStore(false);
let version = 0;

const getCatalog = () => catalogStore.get() as Catalog;
const getMacro = (id: string) => getCatalog().macros.find((m) => m.id === id);

function update(fn: (catalog: Catalog) => Catalog) {
  catalogStore.set((catalog) => (catalog ? fn(catalog) : catalog));
  version++;
  dirtyStore.set(true);
}

const mapMacro = (catalog: Catalog, id: string, fn: (m: Macro) => Macro): Catalog =>
  ({ ...catalog, macros: catalog.macros.map((m) => (m.id === id ? fn(m) : m)) });

const mapProduct = (catalog: Catalog, uid: string, fn: (p: Product) => Product): Catalog => ({
  ...catalog,
  macros: catalog.macros.map((m) =>
    m.products.some((p) => p.uid === uid) ? { ...m, products: m.products.map((p) => (p.uid === uid ? fn(p) : p)) } : m),
});

function findProduct(uid: string) {
  for (const macro of getCatalog().macros) {
    const product = macro.products.find((p) => p.uid === uid);
    if (product) return { macro, product };
  }
  return null;
}

function swap<T>(list: T[], index: number, dir: number): T[] | null {
  const target = index + dir;
  if (index < 0 || target < 0 || target >= list.length) return null;
  const next = list.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Modalita' allineate alle immagini (i vecchi prodotti possono non averle). */
const modesOf = (p: Product) => p.images.map((_, i) => p.imagesMode[i] ?? '');

/* ---------- Appunti locali (stesse chiavi della versione precedente) ---------- */

const TECH_CLIPBOARD = 'catalog_admin_tech_clipboard';
const PRODUCT_CLIPBOARD = 'catalog_admin_product_clipboard';

function readClipboard(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeClipboard(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Apre il selettore file: va chiamata direttamente dal click dell'utente. */
function pickImages(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

const withDefaults = (p: Product): Product => ({
  ...p,
  brand: p.brand || 'BRAND',
  name: p.name || 'Nuovo Prodotto',
  price: p.price || '€ 0.00',
});

/** Codice per un prodotto nuovo o incollato (quello copiato appartiene all'originale). */
const freshId = () => productId(new Set(getCatalog().macros.flatMap((m) => m.products.map((p) => p.id))));

const newProduct = (categoryId: string): Product => ({ ...normalizeProduct({
  brand: 'BRAND',
  name: 'Nuovo Prodotto',
  infoLine: '',
  price: '€ 0.00',
  images: [],
  imagesMode: [],
  tech: [{ k: 'Uve', v: 'Merlot' }, { k: 'Annata', v: '2024' }],
  desc: '<p>Descrizione emozionale del prodotto...</p>',
  pair: '<p>Abbinamenti consigliati...</p>',
}, categoryId), id: freshId() });

/* ---------- API usata dai componenti ---------- */

export const adminApi: AdminApi = {
  toggleMenu: () => menuStore.set((open) => !open),

  async editSettings() {
    const field = await choose({
      title: 'Impostazioni',
      message: 'Cosa vuoi modificare?',
      options: [
        { value: 'title', label: `Nome catalogo · ${getCatalog().title}` },
        { value: 'whatsapp', label: `WhatsApp per gli ordini · ${getCatalog().whatsapp || 'non impostato'}` },
      ],
    });
    if (field === 'title') {
      const title = (await prompt({ title: 'Nome catalogo', label: 'La prima parola appare sopra il logo', value: getCatalog().title }))?.trim();
      if (title) update((c) => ({ ...c, title }));
    } else if (field === 'whatsapp') {
      const value = await prompt({
        title: 'WhatsApp per gli ordini',
        label: 'Numero con prefisso internazionale (es. +39 333 1234567). Vuoto = i clienti condividono la richiesta.',
        value: getCatalog().whatsapp,
      });
      if (value !== null) update((c) => ({ ...c, whatsapp: value.trim() }));
    }
  },

  setMeta(patch) {
    update((c) => ({ ...c, ...patch }));
  },

  async addMacro() {
    const name = (await prompt({ title: 'Nuova macro categoria', label: 'Nome', confirm: 'Crea' }))?.trim();
    if (!name) return null;
    const id = `mcat-${Date.now()}`;
    update((c) => ({
      ...c,
      macros: [...c.macros, {
        id, name, color: '#4ade80', file: macroFileName(c, name),
        bgImage: '', heroImage: '', heroTag: '', heroTitle: '', heroDesc: '', subcategories: [], products: [],
      }],
    }));
    return id;
  },

  async renameMacro(id) {
    const macro = getMacro(id);
    const name = macro && (await prompt({ title: 'Rinomina macro categoria', label: 'Nome', value: macro.name }))?.trim();
    if (name) update((c) => mapMacro(c, id, (m) => ({ ...m, name })));
  },

  async deleteMacro(id) {
    const macro = getMacro(id);
    if (!macro || !(await confirm({
      title: 'Elimina macro categoria',
      message: `Eliminare "${macro.name}" con tutte le sue sottocategorie e i prodotti? Il file verrà rimosso da GitLab al prossimo salvataggio.`,
      danger: true,
      confirm: 'Elimina',
    }))) return false;
    update((c) => ({ ...c, macros: c.macros.filter((m) => m.id !== id) }));
    return true;
  },

  moveMacro(id, dir) {
    const c = getCatalog();
    const macros = swap(c.macros, c.macros.findIndex((m) => m.id === id), dir);
    if (macros) update((cat) => ({ ...cat, macros }));
  },

  setMacro(id, patch) {
    update((c) => mapMacro(c, id, (m) => ({ ...m, ...patch })));
  },

  pickMacroImage(id, field) {
    pickImages(false).then(async ([file]) => {
      if (!file) return;
      const image = await compressImage(file);
      update((c) => mapMacro(c, id, (m) => ({ ...m, [field]: image })));
      toast(field === 'bgImage' ? 'Immagine di sfondo aggiornata.' : 'Immagine hero aggiornata.');
    });
  },

  async addSub(macroId) {
    const name = (await prompt({ title: 'Nuova sottocategoria', label: 'Nome', confirm: 'Crea' }))?.trim();
    if (!name) return null;
    const id = `scat-${Date.now()}`;
    update((c) => mapMacro(c, macroId, (m) => ({ ...m, subcategories: [...m.subcategories, { id, name, color: '#4ade80' }] })));
    return id;
  },

  async renameSub(macroId, subId) {
    const sub = getMacro(macroId)?.subcategories.find((s) => s.id === subId);
    const name = sub && (await prompt({ title: 'Rinomina sottocategoria', label: 'Nome', value: sub.name }))?.trim();
    if (name) {
      update((c) => mapMacro(c, macroId, (m) => ({
        ...m, subcategories: m.subcategories.map((s) => (s.id === subId ? { ...s, name } : s)),
      })));
    }
  },

  async deleteSub(macroId, subId) {
    const sub = getMacro(macroId)?.subcategories.find((s) => s.id === subId);
    if (!sub || !(await confirm({
      title: 'Elimina sottocategoria',
      message: `Eliminare "${sub.name}" e tutti i suoi prodotti?`,
      danger: true,
      confirm: 'Elimina',
    }))) return false;
    update((c) => mapMacro(c, macroId, (m) => ({
      ...m,
      subcategories: m.subcategories.filter((s) => s.id !== subId),
      products: m.products.filter((p) => p.categoryId !== subId),
    })));
    return true;
  },

  moveSub(macroId, subId, dir) {
    const macro = getMacro(macroId);
    const subcategories = macro && swap(macro.subcategories, macro.subcategories.findIndex((s) => s.id === subId), dir);
    if (subcategories) update((c) => mapMacro(c, macroId, (m) => ({ ...m, subcategories })));
  },

  async moveSubToMacro(macroId, subId) {
    const options = getCatalog().macros.filter((m) => m.id !== macroId);
    if (!options.length) {
      toast('Non ci sono altre macro categorie disponibili.', 'info');
      return null;
    }
    const target = await choose({
      title: 'Sposta sottocategoria',
      message: 'In quale macro categoria?',
      options: options.map((m) => ({ value: m.id, label: m.name })),
    });
    const source = getMacro(macroId);
    const sub = source?.subcategories.find((s) => s.id === subId);
    if (!target || !source || !sub) return null;
    const moved = source.products.filter((p) => p.categoryId === subId);
    update((c) => ({
      ...c,
      macros: c.macros.map((m) => {
        if (m.id === macroId) {
          return { ...m, subcategories: m.subcategories.filter((s) => s.id !== subId), products: m.products.filter((p) => p.categoryId !== subId) };
        }
        if (m.id === target) return { ...m, subcategories: [...m.subcategories, sub], products: [...m.products, ...moved] };
        return m;
      }),
    }));
    return target;
  },

  addProduct(macroId, subId) {
    const product = newProduct(subId);
    update((c) => mapMacro(c, macroId, (m) => ({ ...m, products: [...m.products, product] })));
    return product.uid;
  },

  pasteProduct(macroId, subId) {
    const data = readClipboard(PRODUCT_CLIPBOARD);
    if (!data || typeof data !== 'object') {
      toast('Copia prima un prodotto.', 'info');
      return null;
    }
    const product = withDefaults({ ...normalizeProduct(data as Record<string, unknown>, subId), id: freshId() });
    update((c) => mapMacro(c, macroId, (m) => ({ ...m, products: [...m.products, product] })));
    toast('Prodotto incollato nella sottocategoria.');
    return product.uid;
  },

  async deleteProduct(uid) {
    const hit = findProduct(uid);
    if (!hit || !(await confirm({
      title: 'Elimina prodotto',
      message: `Eliminare "${hit.product.name || 'questo prodotto'}"?`,
      danger: true,
      confirm: 'Elimina',
    }))) return;
    update((c) => mapMacro(c, hit.macro.id, (m) => ({ ...m, products: m.products.filter((p) => p.uid !== uid) })));
  },

  updateProduct(uid, change) {
    update((c) => mapProduct(c, uid, (p) => (typeof change === 'function' ? change(p) : { ...p, ...change })));
  },

  moveProduct(uid, dir) {
    const hit = findProduct(uid);
    if (!hit) return;
    const list = hit.macro.products;
    const from = list.indexOf(hit.product);
    let to = from + dir;
    while (to >= 0 && to < list.length && list[to].categoryId !== hit.product.categoryId) to += dir;
    if (to < 0 || to >= list.length) {
      toast(dir < 0 ? 'Il prodotto è già il primo della sottocategoria.' : "Il prodotto è già l'ultimo della sottocategoria.", 'info');
      return;
    }
    const products = list.slice();
    [products[from], products[to]] = [products[to], products[from]];
    update((c) => mapMacro(c, hit.macro.id, (m) => ({ ...m, products })));
  },

  reorderProduct(uid, targetUid) {
    const hit = findProduct(uid);
    if (!hit) return;
    const list = hit.macro.products;
    const from = list.indexOf(hit.product);
    const to = list.findIndex((p) => p.uid === targetUid);
    if (to >= 0 && to !== from) update((c) => mapMacro(c, hit.macro.id, (m) => ({ ...m, products: moveItem(list, from, to) })));
  },

  moveProductTo(uid, macroId, subId) {
    const hit = findProduct(uid);
    if (!hit || hit.product.categoryId === subId) return;
    const moved = { ...hit.product, categoryId: subId };
    update((c) => ({
      ...c,
      macros: c.macros.map((m) => {
        if (m.id === hit.macro.id && m.id === macroId) return { ...m, products: m.products.map((p) => (p.uid === uid ? moved : p)) };
        if (m.id === hit.macro.id) return { ...m, products: m.products.filter((p) => p.uid !== uid) };
        if (m.id === macroId) return { ...m, products: [...m.products, moved] };
        return m;
      }),
    }));
    toast('Prodotto spostato.');
  },

  copyProduct(uid) {
    const hit = findProduct(uid);
    if (!hit) return;
    const { uid: _uid, ...data } = hit.product;
    if (writeClipboard(PRODUCT_CLIPBOARD, data)) toast('Prodotto copiato. Vai nella sottocategoria di destinazione e usa "Incolla prodotto".');
    else toast('Impossibile copiare il prodotto: memoria del browser piena.', 'error');
  },

  copyTech(uid) {
    const hit = findProduct(uid);
    if (hit && writeClipboard(TECH_CLIPBOARD, hit.product.tech)) toast('Scheda tecnica copiata.');
  },

  pasteTech(uid) {
    const tech = readClipboard(TECH_CLIPBOARD);
    if (!Array.isArray(tech)) {
      toast('Copia prima una scheda tecnica.', 'info');
      return;
    }
    update((c) => mapProduct(c, uid, (p) => ({ ...p, tech: tech.map((row) => ({ k: String(row?.k ?? ''), v: String(row?.v ?? '') })) })));
    toast('Scheda tecnica incollata nel prodotto corrente.');
  },

  addImages(uid) {
    pickImages(true).then(async (files) => {
      for (const file of files) {
        const image = await compressImage(file);
        const mode = await choose({
          title: 'MODALITÀ VISUALIZZAZIONE',
          message: 'Come vuoi mostrare questa immagine?',
          image,
          options: [
            { value: 'normal', label: 'Etichetta', icon: faImage },
            { value: 'full', label: 'Full Screen', icon: faExpand, accent: true },
          ],
        });
        if (mode) update((c) => mapProduct(c, uid, (p) => ({ ...p, images: [...p.images, image], imagesMode: [...modesOf(p), mode] })));
      }
    });
  },

  removeImage(uid, index) {
    update((c) => mapProduct(c, uid, (p) => ({
      ...p,
      images: p.images.filter((_, i) => i !== index),
      imagesMode: modesOf(p).filter((_, i) => i !== index),
    })));
    toast('Foto eliminata.');
  },

  toggleImageMode(uid, index) {
    update((c) => mapProduct(c, uid, (p) => {
      const imagesMode = modesOf(p);
      imagesMode[index] = imagesMode[index] === 'full' ? 'normal' : 'full';
      return { ...p, imagesMode };
    }));
  },

  async clearImages(uid) {
    if (await confirm({ title: 'Elimina tutte le foto', message: 'Rimuovere tutte le foto di questo prodotto?', danger: true, confirm: 'Elimina' })) {
      update((c) => mapProduct(c, uid, (p) => ({ ...p, images: [], imagesMode: [] })));
    }
  },

  addPromo() {
    const id = productId(new Set(getCatalog().promos.map((p) => p.id)));
    update((c) => ({
      ...c,
      promos: [...c.promos, {
        id, title: 'Nuova promozione', desc: '', discount: 10, draft: true,
        slots: [{ label: 'Prodotto', qty: 1, ids: [] }, { label: 'Prodotto', qty: 1, ids: [] }],
      }],
    }));
    return id;
  },

  updatePromo(id, patch) {
    update((c) => ({ ...c, promos: c.promos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },

  async deletePromo(id) {
    const promo = getCatalog().promos.find((p) => p.id === id);
    if (!promo || !(await confirm({
      title: 'Elimina promozione',
      message: `Eliminare "${promo.title}"? I pack già nelle selezioni dei clienti tornano prodotti singoli a prezzo normale.`,
      danger: true,
      confirm: 'Elimina',
    }))) return false;
    update((c) => ({ ...c, promos: c.promos.filter((p) => p.id !== id) }));
    return true;
  },
};

/** Stessi pack su tanti prodotti in un colpo: sostituiscono quelli che hanno (lista vuota = li toglie). */
export function setPacksOf(ids: string[], packs: Pack[]) {
  const targets = new Set(ids);
  // campo assente quando non usato: i prodotti senza pack restano identici nel JSON
  const next = (p: Product): Product => ({ ...p, packs: packs.length ? packs.map((pack) => ({ ...pack })) : undefined });
  update((c) => ({
    ...c,
    macros: c.macros.map((m) => (m.products.some((p) => targets.has(p.id))
      ? { ...m, products: m.products.map((p) => (targets.has(p.id) ? next(p) : p)) }
      : m)),
  }));
}

/* ---------- Caricamento e salvataggio ---------- */

// Contenuto dei file come sono su GitLab: si salvano solo quelli cambiati.
let baseline = new Map<string, string>();
let saving = false;

export async function loadAdminCatalog(): Promise<Catalog> {
  const catalog = await loadFromGitLab({ cache: 'no-store' });
  baseline = serializeCatalog(catalog);
  dirtyStore.set(false);
  return catalog;
}

// Le funzioni Vercel accettano al massimo 4,5 MB per richiesta (il JSON viaggia compresso).
const MAX_UPLOAD = 4.4 * 1024 * 1024;

async function post(what: string, headers: Record<string, string>, body?: BodyInit) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', ...headers },
    body,
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    throw new Error("Sessione scaduta: accedi di nuovo da un'altra scheda (/admin-login.html) e riprova. Le modifiche restano qui finché non chiudi la pagina.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(`Errore salvando ${what}: ${data?.error ?? `HTTP ${res.status}`}`);
  }
  return res;
}

/**
 * Le foto base64 dei file da salvare vanno nello storage foto (Cloudflare R2), una richiesta per foto:
 * nel JSON resta solo il link, cosi' nessuna categoria supera il limite di 4,5 MB per salvataggio.
 */
async function uploadImages(contents: string[], toastId: number) {
  const srcs = [...new Set(contents.flatMap(dataImages))];
  const links = new Map<string, string>();
  try {
    for (const [i, src] of srcs.entries()) {
      toast(`Caricamento foto ${i + 1}/${srcs.length}…`, 'loading', toastId);
      const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (c) => c.charCodeAt(0));
      const res = await post(`la foto ${i + 1}`, { 'x-action': 'image', 'x-type': src.slice(11, src.indexOf(';')) }, bytes);
      links.set(src, (await res.json()).url);
    }
  } finally {
    // anche se una foto fallisce, quelle gia' caricate restano collegate: al prossimo salvataggio non si ripetono
    if (links.size) catalogStore.set((c) => c && replaceStrings(c, links));
  }
}

async function sendFile(file: string, content: string | null, message: string) {
  const headers: Record<string, string> = { 'x-file': file, 'x-message': encodeURIComponent(message) };
  let body: Blob | undefined;
  if (content === null) headers['x-action'] = 'delete';
  else {
    body = new Blob([content]);
    if (typeof CompressionStream === 'function') {
      body = await new Response(body.stream().pipeThrough(new CompressionStream('gzip'))).blob();
      headers['x-gzip'] = '1';
    }
    if (body.size > MAX_UPLOAD) {
      throw new Error(`"${file}" è troppo grande per il salvataggio (${(body.size / 1048576).toFixed(1)} MB compressi, max 4,4 MB): riduci o elimina alcune immagini di questa categoria.`);
    }
  }
  await post(file, headers, body);
}

const changedFiles = (files: Map<string, string>) => [...files].filter(([file, content]) => baseline.get(file) !== content);

export async function save() {
  if (!catalogStore.get() || saving) return;
  saving = true;
  menuStore.set(false);
  const startVersion = version;
  const id = toast('Salvataggio su GitLab…', 'loading');
  try {
    await uploadImages(changedFiles(serializeCatalog(getCatalog())).map(([, content]) => content), id);
    const catalog = getCatalog();
    const files = serializeCatalog(catalog);
    // prima i file categoria, poi config.json: il config non punta mai a un file non ancora creato
    const changed = changedFiles(files).sort(([a], [b]) => Number(a === CONFIG_FILE) - Number(b === CONFIG_FILE));
    const removed = [...baseline.keys()].filter((file) => !files.has(file));
    const total = changed.length + removed.length;

    if (!total) {
      toast('Nessuna modifica da salvare.', 'info', id);
      if (version === startVersion) dirtyStore.set(false);
      return;
    }

    let done = 0;
    toast(`Salvataggio su GitLab 0/${total}…`, 'loading', id);
    for (const [file, content] of changed) {
      const name = catalog.macros.find((m) => m.file === file)?.name ?? file;
      const message = file === CONFIG_FILE ? 'Aggiornamento config catalogo'
        : baseline.has(file) ? `Aggiornamento ${name}` : `Nuova macro categoria: ${name}`;
      await sendFile(file, content, message);
      baseline.set(file, content);
      toast(`Salvataggio su GitLab ${++done}/${total}…`, 'loading', id);
    }
    for (const file of removed) {
      await sendFile(file, null, `Rimossa macro categoria: ${file}`);
      baseline.delete(file);
      toast(`Salvataggio su GitLab ${++done}/${total}…`, 'loading', id);
    }
    toast('Catalogo salvato. Il sito pubblico si aggiorna entro un minuto.', 'success', id, 5000);
    if (version === startVersion) dirtyStore.set(false);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Errore durante il salvataggio.', 'error', id, 12000);
  } finally {
    saving = false;
  }
}

export async function logout() {
  menuStore.set(false);
  if (dirtyStore.get() && !(await confirm({
    title: 'Modifiche non salvate',
    message: 'Uscendo perderai le modifiche non salvate su GitLab.',
    danger: true,
    confirm: 'Esci comunque',
  }))) return;
  dirtyStore.set(false);
  location.href = '/api/logout';
}
