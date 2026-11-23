// Modello del catalogo. La forma ricalca i JSON su GitLab:
//   config.json        -> { title, macroCategories: MacroEntry[] }
//   <macro>.json       -> { subcategories: Sub[], products: Product[] (senza uid, con il codice id) }
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
  /** Solo client: identificativo per React e per lo stato dell'admin. Mai salvato. */
  uid: string;
  /** Codice fisso del prodotto (salvato nel JSON): identifica il prodotto nei link e nella selezione, anche se cambia nome. */
  id: string;
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
  /** Opzionale: codici dei prodotti consigliati ("Potrebbero piacerti"). Assente = scelti in automatico. */
  related?: string[];
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

/** Un gruppo di prodotti: scelti uno per uno e/o categorie intere (che comprendono anche i prodotti aggiunti dopo). */
export interface Scope {
  /** Codici dei prodotti scelti uno per uno. */
  ids: string[];
  /** Opzionale: codici di sottocategorie intere. */
  subs?: string[];
  /** Opzionale: codici di macro categorie intere. */
  macros?: string[];
}

/** Una scelta del pack promo: "1 panettone tra questi". */
export interface PromoSlot extends Scope {
  label: string;
  /** Pezzi da scegliere. */
  qty: number;
  /** Pezzi in omaggio. Assente = a pagamento. */
  free?: boolean;
  [extra: string]: unknown;
}

/** Promozione "componi il tuo pack" (config.json -> promos). */
export interface Promo {
  id: string;
  title: string;
  desc: string;
  /** Sconto percentuale sui pezzi a pagamento del pack. */
  discount: number;
  slots: PromoSlot[];
  /** Ultimo giorno valido, "AAAA-MM-GG". Assente = senza scadenza. */
  end?: string;
  /** Bozza: visibile solo in admin. */
  draft?: boolean;
  [extra: string]: unknown;
}

export interface Catalog {
  title: string;
  /** Opzionale: frase sotto il titolo nella home. */
  tagline: string;
  /** Opzionale: numero WhatsApp per le richieste d'ordine (es. "+39 333 1234567"). */
  whatsapp: string;
  /** Opzionale nel JSON: promozioni pack. */
  promos: Promo[];
  macros: Macro[];
}
