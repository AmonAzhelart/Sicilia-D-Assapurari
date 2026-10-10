// Modello del catalogo. La forma ricalca i JSON su GitLab:
//   config.json        -> { title, macroCategories: MacroEntry[] }
//   <macro>.json       -> { subcategories: Sub[], products: Product[] (senza uid) }
// Le chiavi sconosciute vengono preservate al salvataggio.

export interface TechRow {
  k: string;
  v: string;
}

export interface Pack {
  qty: number;
  /** Sconto percentuale sulla somma dei prezzi dei pezzi. */
  discount: number;
}

export interface Product {
  /** Solo client: identificativo stabile per React e per l'URL. Mai salvato. */
  uid: string;
  /** Id della sottocategoria (nome del campo nel JSON). */
  categoryId: string;
  brand: string;
  name: string;
  infoLine: string;
  price: string;
  images: string[];
  /** 'full' = foto a tutto riquadro; altrimenti l'immagine viene scontornata dal bianco. */
  imagesMode: string[];
  tech: TechRow[];
  desc: string;
  pair: string;
  /** Opzionale: sconto percentuale del prodotto. Assente = non scontato. */
  discount?: number;
  /** Opzionale: offerte pack. */
  packs?: Pack[];
  [extra: string]: unknown;
}

export interface Sub {
  id: string;
  name: string;
  color: string;
  [extra: string]: unknown;
}

export interface Macro {
  id: string;
  name: string;
  color: string;
  file: string;
  bgImage: string;
  heroImage: string;
  heroTag: string;
  heroTitle: string;
  heroDesc: string;
  subcategories: Sub[];
  products: Product[];
  [extra: string]: unknown;
}

export interface Catalog {
  title: string;
  /** Opzionale: frase sotto il titolo nella home. */
  tagline: string;
  /** Opzionale: numero WhatsApp per le richieste d'ordine (es. "+39 333 1234567"). */
  whatsapp: string;
  macros: Macro[];
}
