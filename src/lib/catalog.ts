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

/* ---------- Codice prodotto ---------- */

// Ogni prodotto ha un codice fisso salvato nel JSON: identifica il prodotto nei link (?p=nome-codice) e nella
// selezione del cliente, quindi rinominarlo non rompe nulla. Chi non lo ha ancora riceve un codice derivato
// dal nome, uguale a ogni caricamento; l'admin lo scrive nel JSON al primo salvataggio del suo file
// (prima di un'eventuale rinomina, perche' il codice e' calcolato al caricamento).
const hash36 = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

/** Codice non presente in `taken` (che viene aggiornato): derivato da `seed`, casuale se manca. */
export function productId(taken: Set<string>, seed = Math.random().toString(36)): string {
  let id = hash36(seed);
  for (let n = 2; taken.has(id); n++) id = hash36(`${seed}#${n}`);
  taken.add(id);
  return id;
}

const VALID_ID = /^[a-z0-9]+$/;

/* ---------- Normalizzazione ---------- */

export function normalizeProduct(raw: Json, categoryId?: string): Product {
  const { subcategoryId, macroCategory: _macro, uid: _uid, ...rest } = raw || {};
  return {
    ...rest,
    uid: newUid(),
    id: str(rest.id),
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
  const macros = list(config?.macroCategories).map((m, i) => normalizeMacro(m, files?.[i]));
  // codici salvati invariati; mancanti, non validi o doppi -> derivati dal nome
  const taken = new Set<string>();
  for (const p of macros.flatMap((m) => m.products)) {
    if (VALID_ID.test(p.id) && !taken.has(p.id)) taken.add(p.id);
    else p.id = productId(taken, `${p.brand} ${p.name}`);
  }
  return { title: str(config?.title), tagline: str(config?.tagline), whatsapp: str(config?.whatsapp), macros };
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
  // tagline e whatsapp solo se impostati: un config senza di essi resta identico
  const { title, tagline, whatsapp } = catalog;
  files.set(CONFIG_FILE, JSON.stringify({ title, ...(tagline && { tagline }), ...(whatsapp && { whatsapp }), macroCategories }, null, 2));
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
  /** uid -> parametro ?p= ("nome-codice"). */
  productSlug: Map<string, string>;
  byId: Map<string, ProductRef>;
  /** Link condivisi prima dei codici prodotto ("brand-nome"). */
  byLegacySlug: Map<string, ProductRef>;
  byUid: Map<string, ProductRef>;
  entries: SearchEntry[];
}

const indexCache = new WeakMap<Catalog, CatalogIndex>();

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const cached = indexCache.get(catalog);
  if (cached) return cached;

  const index: CatalogIndex = {
    macroSlug: new Map(), macroBySlug: new Map(), subSlug: new Map(), subBySlug: new Map(),
    productSlug: new Map(), byId: new Map(), byLegacySlug: new Map(), byUid: new Map(), entries: [],
  };
  const macroSlugs = new Set<string>();
  const legacySlugs = new Set<string>();

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
      index.productSlug.set(product.uid, `${slugify(product.name)}-${product.id}`);
      index.byId.set(product.id, ref);
      index.byLegacySlug.set(uniqueSlug(slugify(`${product.brand} ${product.name}`), legacySlugs), ref);
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

/**
 * Prodotto da ?p= o da una chiave della selezione: conta il codice dopo l'ultimo "-" (il nome puo' cambiare);
 * in mancanza, vecchi link "brand-nome".
 */
export function productFromParam(index: CatalogIndex, param: string): ProductRef | undefined {
  return index.byId.get(param.slice(param.lastIndexOf('-') + 1)) ?? index.byLegacySlug.get(param);
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

/* ---------- Dati chiave della scheda tecnica ---------- */

// In ordine di importanza; le voci sono testo libero, quindi si riconoscono dal nome.
const FACT_PATTERNS = [
  /gradazione|alcol/i,
  /formato|capacit|contenuto|peso|grammatura/i,
  /uvaggio|vitign|\buve\b|ingrediente/i,
  /denominazione|tipologia/i,
  /zona|origine|provenienza|regione/i,
  /annata|invecchiamento|affinamento|stagionatura/i,
];

/** Fino a 4 voci della scheda tecnica da mettere in evidenza in cima alla scheda prodotto. */
export function keyFacts(tech: TechRow[], max = 4): TechRow[] {
  const facts: TechRow[] = [];
  for (const pattern of FACT_PATTERNS) {
    const row = tech.find((r) => pattern.test(r.k) && r.v.trim() && !facts.includes(r));
    if (row) facts.push(row);
    if (facts.length === max) break;
  }
  return facts;
}
