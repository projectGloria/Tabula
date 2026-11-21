import type { Point } from '../core/geometry/vec';

type Listener<T> = (value: T) => void;

/** A value React can read with `useSyncExternalStore`. */
export class Observable<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}

  get = (): T => this.value;

  set(value: T): void {
    if (Object.is(value, this.value)) return;
    this.value = value;
    for (const l of [...this.listeners]) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export type DialogId = 'drawings' | 'export' | 'shortcuts' | 'palette';

export interface NoticeAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Notice {
  readonly id: number;
  readonly message: string;
  readonly tone: 'info' | 'error';
  readonly action?: NoticeAction;
}

const NOTICE_MS = 5000;

/** UI-only channel between the canvas, commands and floating UI. */
export class UiBus {
  /** Last pointer position over the canvas in world units; null when it left. */
  pointerWorld: Point | null = null;
  readonly dialog = new Observable<DialogId | null>(null);
  readonly notices = new Observable<readonly Notice[]>([]);
  private menuListeners = new Set<Listener<Point>>();
  private nextNotice = 1;

  /** Asks the context menu to open at a viewport-relative screen point. */
  openContextMenu(screen: Point): void {
    for (const l of this.menuListeners) l(screen);
  }

  onContextMenu(listener: Listener<Point>): () => void {
    this.menuListeners.add(listener);
    return () => {
      this.menuListeners.delete(listener);
    };
  }

  /** Shows a toast; info toasts without an action dismiss themselves. */
  notify(message: string, tone: Notice['tone'] = 'info', action?: NoticeAction): number {
    const id = this.nextNotice++;
    const notice: Notice = action ? { id, message, tone, action } : { id, message, tone };
    this.notices.set([...this.notices.get().slice(-3), notice]);
    if (tone === 'info' && !action) {
      setTimeout(() => {
        this.dismiss(id);
      }, NOTICE_MS);
    }
    return id;
  }

  dismiss(id: number): void {
    const list = this.notices.get();
    if (list.some((n) => n.id === id)) this.notices.set(list.filter((n) => n.id !== id));
  }
}
