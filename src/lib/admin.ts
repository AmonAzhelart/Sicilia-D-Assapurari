// Contratto tra i componenti condivisi e l'admin. Nel sito pubblico il contesto e' null,
// quindi i controlli di modifica non vengono renderizzati e il loro codice non viene caricato.
import { createContext, useContext } from 'react';
import type { Catalog, Macro, Product } from '../types';

export interface AdminApi {
  /** Impostazioni generali: nome del catalogo e numero WhatsApp per le richieste. */
  editSettings(): void;
  setMeta(patch: Partial<Pick<Catalog, 'title' | 'tagline' | 'whatsapp'>>): void;
  toggleMenu(): void;

  addMacro(): Promise<string | null>;
  renameMacro(id: string): void;
  deleteMacro(id: string): Promise<boolean>;
  moveMacro(id: string, dir: -1 | 1): void;
  setMacro(id: string, patch: Partial<Macro>): void;
  pickMacroImage(id: string, field: 'bgImage' | 'heroImage'): void;

  addSub(macroId: string): Promise<string | null>;
  renameSub(macroId: string, subId: string): void;
  deleteSub(macroId: string, subId: string): Promise<boolean>;
  moveSub(macroId: string, subId: string, dir: -1 | 1): void;
  moveSubToMacro(macroId: string, subId: string): Promise<string | null>;

  addProduct(macroId: string, subId: string): string;
  pasteProduct(macroId: string, subId: string): string | null;
  deleteProduct(uid: string): void;
  updateProduct(uid: string, update: Partial<Product> | ((p: Product) => Product)): void;
  moveProduct(uid: string, dir: -1 | 1): void;
  reorderProduct(uid: string, targetUid: string): void;
  moveProductTo(uid: string, macroId: string, subId: string): void;
  copyProduct(uid: string): void;
  copyTech(uid: string): void;
  pasteTech(uid: string): void;

  addImages(uid: string): void;
  removeImage(uid: string, index: number): void;
  toggleImageMode(uid: string, index: number): void;
  clearImages(uid: string): void;
}

export const AdminContext = createContext<AdminApi | null>(null);
export const useAdmin = () => useContext(AdminContext);
