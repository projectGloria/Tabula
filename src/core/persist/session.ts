import type { Camera } from '../camera/camera';
import { EMPTY_SCENE } from '../model/scene';
import { applyDocument, documentFromState, sameDrawing, type TabulaDocument } from '../io/document';
import type { AppState } from '../store/app-state';
import type { Editor } from '../store/editor';
import { QuotaError, type DrawingMeta, type DrawingStore } from './store';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'quota' | 'error';

export interface SessionInfo {
  /** Active drawing id; null before `start` resolves. */
  readonly id: string | null;
  readonly name: string;
  readonly status: SaveStatus;
  /** Another tab opened this drawing; saving is paused until `takeOver`. */
  readonly conflict: boolean;
}

/** Cross-tab messages about which drawing each tab has open. */
export interface TabMessage {
  readonly type: 'open';
  readonly id: string;
  readonly tab: string;
}

/** Minimal BroadcastChannel surface, injectable for tests. */
export interface TabChannel {
  post(message: TabMessage): void;
  onMessage(listener: (message: unknown) => void): void;
  close(): void;
}

export function broadcastTabChannel(name = 'tabula-tabs'): TabChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const ch = new BroadcastChannel(name);
  return {
    post: (m) => {
      ch.postMessage(m);
    },
    onMessage: (l) => {
      ch.onmessage = (e: MessageEvent) => {
        l(e.data);
      };
    },
    close: () => {
      ch.close();
    },
  };
}

export interface SessionOptions {
  readonly store: DrawingStore;
  readonly channel: TabChannel | null;
  readonly newId: () => string;
  readonly defaultName: () => string;
  readonly now?: () => number;
  readonly debounceMs?: number;
  /** Renders a small preview of the drawing; null when it is empty or unsupported. */
  readonly thumbnail?: (state: AppState) => Promise<Blob | null>;
  /** Minimum time between thumbnail renders while editing. */
  readonly thumbnailIntervalMs?: number;
}

const ACTIVE_KEY = 'activeDrawing';

/**
 * Owns the active drawing: restores it, autosaves debounced edits to the
 * store, and pauses saving when another tab opens the same drawing.
 */
export class DrawingSession {
  private info: SessionInfo = { id: null, name: '', status: 'idle', conflict: false };
  private listeners = new Set<() => void>();
  private saved: AppState | null = null;
  private savedCamera: Camera | null = null;
  private created = 0;
  private thumb: Blob | null = null;
  private thumbAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private readonly tab: string;
  private readonly now: () => number;
  private readonly debounceMs: number;
  private unsubscribe: (() => void) | null = null;
  /** Set while a drawing is being swapped in, so the swap is not saved as an edit. */
  private switching = false;

  constructor(
    private readonly editor: Editor,
    private readonly opts: SessionOptions,
  ) {
    this.tab = opts.newId();
    this.now = opts.now ?? (() => Date.now());
    this.debounceMs = opts.debounceMs ?? 600;
    opts.channel?.onMessage((m) => {
      this.onTabMessage(m);
    });
  }

  getInfo = (): SessionInfo => this.info;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Restores the last active drawing, or creates a first one. */
  async start(): Promise<void> {
    const active = await this.opts.store.getSetting(ACTIVE_KEY);
    const opened = typeof active === 'string' && (await this.load(active));
    if (!opened) {
      const list = await this.opts.store.listDrawings();
      const latest = list.sort((a, b) => b.updated - a.updated)[0];
      if (!latest || !(await this.load(latest.id))) await this.create();
    }
    this.unsubscribe ??= this.editor.subscribe(() => {
      this.onChange();
    });
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.opts.channel?.close();
  }

  /** Writes pending changes now (also saves a moved camera). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.inFlight;
    const s = this.editor.getState();
    const dirty = !this.saved || !sameDrawing(this.saved, s) || this.savedCamera !== s.camera;
    if (dirty) await this.save();
  }

  /** Saves the current drawing, then opens a new empty one. */
  async create(doc?: TabulaDocument, name?: string): Promise<string> {
    if (this.info.id !== null) await this.flush();
    const id = this.opts.newId();
    const t = this.now();
    const meta: DrawingMeta = {
      id,
      name: name ?? this.opts.defaultName(),
      created: t,
      updated: t,
      thumbnail: null,
    };
    this.switching = true;
    try {
      this.editor.reset((s) =>
        applyDocument(s, doc ?? documentFromState({ ...s, scene: EMPTY_SCENE })),
      );
    } finally {
      this.switching = false;
    }
    this.activate(meta);
    await this.save();
    return id;
  }

  /** Switches to a stored drawing; false when it is missing or unreadable. */
  async open(id: string): Promise<boolean> {
    if (id === this.info.id) return true;
    await this.flush();
    return this.load(id);
  }

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim().slice(0, 200);
    if (!trimmed) return;
    if (id === this.info.id) {
      this.set({ name: trimmed });
      await this.save();
      return;
    }
    const rec = await this.opts.store.getDrawing(id);
    if (rec) await this.opts.store.putMeta({ ...rec.meta, name: trimmed });
  }

  /** Copies a drawing (the active one with its unsaved edits) under a new id. */
  async duplicate(id: string, name: (original: string) => string): Promise<string | null> {
    if (id === this.info.id) await this.flush();
    const rec = await this.opts.store.getDrawing(id);
    if (!rec) return null;
    const t = this.now();
    const copy = this.opts.newId();
    await this.opts.store.putDrawing({
      meta: { ...rec.meta, id: copy, name: name(rec.meta.name), created: t, updated: t },
      doc: rec.doc,
      camera: rec.camera,
    });
    return copy;
  }

  /** Deletes a drawing; deleting the active one opens the most recent other (or a new one). */
  async remove(id: string): Promise<void> {
    if (id === this.info.id) {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      await this.inFlight;
      await this.opts.store.deleteDrawing(id);
      this.info = { ...this.info, id: null };
      const list = await this.opts.store.listDrawings();
      const next = list.sort((a, b) => b.updated - a.updated)[0];
      if (!next || !(await this.load(next.id))) await this.create();
      return;
    }
    await this.opts.store.deleteDrawing(id);
  }

  /** Resumes saving in this tab and tells other tabs to pause. */
  async takeOver(): Promise<void> {
    const id = this.info.id;
    if (id === null) return;
    this.set({ conflict: false });
    this.announce(id);
    await this.save();
  }

  /** Ids of every image file referenced by stored drawings plus `extra`. */
  async referencedFiles(extra: Iterable<string> = []): Promise<Set<string>> {
    const out = new Set(extra);
    for (const meta of await this.opts.store.listDrawings()) {
      const rec = await this.opts.store.getDrawing(meta.id);
      for (const el of rec?.doc.elements ?? []) {
        const fileId = (el as { fileId?: unknown }).fileId;
        if (typeof fileId === 'string') out.add(fileId);
      }
    }
    return out;
  }

  private async load(id: string): Promise<boolean> {
    const rec = await this.opts.store.getDrawing(id);
    if (!rec) return false;
    this.switching = true;
    try {
      this.editor.reset((s) => {
        const next = applyDocument(s, rec.doc);
        return rec.camera ? { ...next, camera: rec.camera } : next;
      });
    } finally {
      this.switching = false;
    }
    this.activate(rec.meta);
    this.thumb = rec.meta.thumbnail;
    this.set({ status: 'saved' });
    return true;
  }

  private activate(meta: DrawingMeta): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const s = this.editor.getState();
    this.saved = s;
    this.savedCamera = s.camera;
    this.created = meta.created;
    this.thumb = meta.thumbnail;
    this.thumbAt = 0;
    this.set({ id: meta.id, name: meta.name, status: 'saved', conflict: false });
    this.announce(meta.id);
    void this.opts.store.setSetting(ACTIVE_KEY, meta.id).catch(() => undefined);
  }

  private announce(id: string): void {
    this.opts.channel?.post({ type: 'open', id, tab: this.tab });
  }

  private onTabMessage(m: unknown): void {
    if (typeof m !== 'object' || m === null) return;
    const msg = m as Partial<TabMessage>;
    if (msg.type !== 'open' || msg.tab === this.tab || msg.id !== this.info.id) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.set({ conflict: true });
  }

  private onChange(): void {
    if (this.switching || this.info.id === null || this.info.conflict) return;
    const s = this.editor.getState();
    if (this.saved && sameDrawing(this.saved, s)) return;
    if (this.info.status !== 'pending') this.set({ status: 'pending' });
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, this.debounceMs);
  }

  private async save(): Promise<void> {
    const id = this.info.id;
    if (id === null || this.info.conflict) return;
    await this.inFlight;
    const state = this.editor.getState();
    const t = this.now();
    const run = async (): Promise<void> => {
      this.set({ status: 'saving' });
      let thumbnail = this.thumb;
      const make = this.opts.thumbnail;
      const interval = this.opts.thumbnailIntervalMs ?? 8000;
      if (make && (thumbnail === null || t - this.thumbAt >= interval)) {
        try {
          thumbnail = await make(state);
          this.thumb = thumbnail;
          this.thumbAt = t;
        } catch {
          // A failed preview never blocks the save.
        }
      }
      await this.opts.store.putDrawing({
        meta: { id, name: this.info.name, created: this.created, updated: t, thumbnail },
        doc: documentFromState(state),
        camera: state.camera,
      });
      // Only mark clean if the drawing we just saved is still the active one.
      if (this.info.id === id) {
        this.saved = state;
        this.savedCamera = state.camera;
        const latest = this.editor.getState();
        this.set({ status: sameDrawing(state, latest) ? 'saved' : 'pending' });
      }
    };
    const p = run().catch((e: unknown) => {
      this.set({ status: e instanceof QuotaError ? 'quota' : 'error' });
    });
    this.inFlight = p;
    await p;
    if (this.inFlight === p) this.inFlight = null;
  }

  private set(patch: Partial<SessionInfo>): void {
    this.info = { ...this.info, ...patch };
    for (const l of [...this.listeners]) l();
  }
}
