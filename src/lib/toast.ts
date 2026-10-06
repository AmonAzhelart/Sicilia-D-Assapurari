import { createStore } from './store';

export type ToastType = 'success' | 'error' | 'loading' | 'info';
export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export const toastStore = createStore<Toast[]>([]);
let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toastStore.set((list) => list.filter((t) => t.id !== id));
}

/** Mostra una notifica; passando `replaceId` aggiorna una notifica esistente (es. "Salvataggio 2/3"). */
export function toast(message: string, type: ToastType = 'success', replaceId?: number, duration = 4000): number {
  const id = replaceId ?? ++seq;
  clearTimeout(timers.get(id));
  toastStore.set((list) => [...list.filter((t) => t.id !== id), { id, message, type }]);
  if (type !== 'loading') timers.set(id, setTimeout(() => dismissToast(id), duration));
  return id;
}
