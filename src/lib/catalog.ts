// Caricamento, normalizzazione, serializzazione, slug e ricerca del catalogo.
// Nessuna dipendenza dal DOM: testato con `npm test`.
import type { Catalog, Macro, Product, Sub, TechRow } from '../types';

type Json = Record<string, any>;

export const CONFIG_FILE = 'config.json';
const GITLAB_FILES = 'https://gitlab.com/api/v4/projects/fonti.alessandro98%2Fcatalogo_sicilia_dassapurari/repository/files/';
export const rawFileUrl = (file: string) => `${GITLAB_FILES}${encodeURIComponent(file)}/raw?ref=main`;

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const list = (value: unknown): Json[] => (Array.isArray(value) ? value : []);

let uidSeq = 0;
export const newUid = () => `u${(++uidSeq).toString(36)}`;

/* ---------- Normalizzazione ---------- */

export function normalizeProduct(raw: Json, categoryId?: string): Product {
  const { subcategoryId, macroCategory: _macro, uid: _uid, ...rest } = raw || {};
  return {
    ...rest,
    uid: newUid(),
    categoryId: categoryId ?? (str(rest.categoryId) || str(subcategoryId)),
    brand: str(rest.brand),
    name: str(rest.name),
    infoLine: str(rest.infoLine),
    price: str(rest.price),
    images: list(rest.images).map(str),
    imagesMode: list(rest.imagesMode).map(str),
    tech: list(rest.tech).map((row): TechRow => ({ k: str(row?.k), v: str(row?.v) })),
    desc: str(rest.desc),
    pair: str(rest.pair),
  };
}

function normalizeMacro(entry: Json, file?: Json): Macro {
  const { subcategories: embeddedSubs, products: embeddedProducts, ...rest } = entry;
  return {
    ...rest,
    id: str(entry.id),
    name: str(entry.name),
    color: str(entry.color),
    file: str(entry.file),
    bgImage: str(entry.bgImage),
    heroImage: str(entry.heroImage),
    heroTag: str(entry.heroTag),
    heroTitle: str(entry.heroTitle),
    heroDesc: str(entry.heroDesc),
    subcategories: list(file ? file.subcategories : embeddedSubs).map(
      (s): Sub => ({ ...s, id: str(s.id), name: str(s.name), color: str(s.color) }),
    ),
    products: list(file ? file.products : embeddedProducts).map((p) => normalizeProduct(p)),
  };
}

/** Da config.json (+ file categoria) oppure dalla risposta di /api/catalog (dati già incorporati). */
export function buildCatalog(config: Json, files?: Json[]): Catalog {
  return {
    title: str(config?.title),
    macros: list(config?.macroCategories).map((m, i) => normalizeMacro(m, files?.[i])),
  };
}

/* ---------- Caricamento ---------- */

async function getJson(url: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(url, init);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

/** Lettura diretta da GitLab (JSON completi, immagini base64 incluse). */
export async function loadFromGitLab(init?: RequestInit): Promise<Catalog> {
  const config = await getJson(rawFileUrl(CONFIG_FILE), init);
  const files = await Promise.all(
    list(config.macroCategories).map((m) =>
      getJson(rawFileUrl(str(m.file)), init).catch((err) => {
        if (err.status === 404) return {};
        throw err;
      }),
    ),
  );
  return buildCatalog(config, files);
}

/** Catalogo pubblico: API leggera con cache CDN, con ripiego su GitLab diretto. */
export async function loadPublicCatalog(): Promise<Catalog> {
  try {
    return buildCatalog(await getJson('/api/catalog'));
  } catch (err) {
    console.warn('API catalogo non disponibile, uso GitLab diretto', err);
    return loadFromGitLab();
  }
}

/* ---------- Serializzazione (salvataggio admin) ---------- */

export function serializeCatalog(catalog: Catalog): Map<string, string> {
  const files = new Map<string, string>();
  const macroCategories = catalog.macros.map(({ subcategories: _s, products: _p, ...entry }) => entry);
  for (const m of catalog.macros) {
    files.set(m.file, JSON.stringify({
      subcategories: m.subcategories,
      products: m.products.map(({ uid: _uid, ...p }) => p),
    }, null, 2));
  }
  files.set(CONFIG_FILE, JSON.stringify({ title: catalog.title, macroCategories }, null, 2));
  return files;
}

/** Nome file univoco per una nuova macro categoria (stessa convenzione dell'originale). */
export function macroFileName(catalog: Catalog, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'categoria';
  const taken = new Set([CONFIG_FILE, ...catalog.macros.map((m) => m.file)]);
  let file = `${base}.json`;
  for (let n = 2; taken.has(file); n++) file = `${base}_${n}.json`;
  return file;
}

/* ---------- Indice: slug per gli URL e testo per la ricerca ---------- */

export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const slugify = (text: string) =>
  fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';

function uniqueSlug(base: string, taken: Set<string>) {
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export interface ProductRef {
  macro: Macro;
  product: Product;
  sub?: Sub;
}

interface SearchEntry extends ProductRef {
  primary: string;
  secondary: string;
}

export interface CatalogIndex {
  macroSlug: Map<string, string>;
  macroBySlug: Map<string, Macro>;
  subSlug: Map<string, string>;
  subBySlug: Map<string, Map<string, Sub>>;
  productSlug: Map<string, string>;
  productBySlug: Map<string, ProductRef>;
  byUid: Map<string, ProductRef>;
  entries: SearchEntry[];
}

const indexCache = new WeakMap<Catalog, CatalogIndex>();

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const cached = indexCache.get(catalog);
  if (cached) return cached;

  const index: CatalogIndex = {
    macroSlug: new Map(), macroBySlug: new Map(), subSlug: new Map(), subBySlug: new Map(),
    productSlug: new Map(), productBySlug: new Map(), byUid: new Map(), entries: [],
  };
  const macroSlugs = new Set<string>();
  const productSlugs = new Set<string>();

  for (const macro of catalog.macros) {
    const mSlug = uniqueSlug(slugify(macro.name), macroSlugs);
    index.macroSlug.set(macro.id, mSlug);
    index.macroBySlug.set(mSlug, macro);

    const subs = new Map<string, Sub>();
    const subSlugs = new Set<string>();
    for (const sub of macro.subcategories) {
      const sSlug = uniqueSlug(slugify(sub.name), subSlugs);
      index.subSlug.set(sub.id, sSlug);
      subs.set(sSlug, sub);
    }
    index.subBySlug.set(macro.id, subs);

    for (const product of macro.products) {
      const sub = macro.subcategories.find((s) => s.id === product.categoryId);
      const ref: ProductRef = { macro, product, sub };
      const pSlug = uniqueSlug(slugify(`${product.brand} ${product.name}`), productSlugs);
      index.productSlug.set(product.uid, pSlug);
      index.productBySlug.set(pSlug, ref);
      index.byUid.set(product.uid, ref);
      index.entries.push({
        ...ref,
        primary: fold(`${product.brand} ${product.name} ${product.infoLine} ${product.price}`),
        secondary: fold(product.tech.map((row) => row.v).join(' ')),
      });
    }
  }

  indexCache.set(catalog, index);
  return index;
}

export interface SearchGroup {
  macro: Macro;
  items: ProductRef[];
}

/** Ricerca multi-parola, senza accenti; prima le corrispondenze su brand/nome/prezzo. */
export function searchCatalog(index: CatalogIndex, query: string): SearchGroup[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const groups = new Map<Macro, { strong: ProductRef[]; weak: ProductRef[] }>();
  for (const entry of index.entries) {
    const strong = terms.every((t) => entry.primary.includes(t));
    if (!strong && !terms.every((t) => entry.primary.includes(t) || entry.secondary.includes(t))) continue;
    let group = groups.get(entry.macro);
    if (!group) groups.set(entry.macro, (group = { strong: [], weak: [] }));
    (strong ? group.strong : group.weak).push({ macro: entry.macro, product: entry.product, sub: entry.sub });
  }
  return Array.from(groups, ([macro, g]) => ({ macro, items: [...g.strong, ...g.weak] }));
}

/* ---------- Testo ---------- */

const PLACEHOLDERS = new Set(['descrizione emozionale del prodotto...', 'abbinamenti consigliati...']);

/** Testo vuoto o segnaposto di default dell'admin: nel sito pubblico la sezione viene nascosta. */
export function isBlankHtml(html: string): boolean {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return !text || PLACEHOLDERS.has(text);
}

/** "SICILIA D'ASSAPURARI" -> ["SICILIA", "D'ASSAPURARI"] (eyebrow + wordmark del brand). */
export function splitTitle(title: string): [string, string] {
  const i = title.indexOf(' ');
  return i > 0 ? [title.slice(0, i), title.slice(i + 1)] : [title, title];
}
