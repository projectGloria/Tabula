/**
 * Disk access: File System Access API where available, with a file-input /
 * download fallback. Nothing here leaves the device.
 */

export interface FileTypeSpec {
  readonly description: string;
  readonly mime: string;
  readonly extensions: readonly string[];
}

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface PickerWindow {
  showOpenFilePicker?: (o: {
    types: PickerType[];
    multiple: boolean;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (o: {
    types: PickerType[];
    suggestedName: string;
  }) => Promise<FileSystemFileHandle>;
}

const pickerWindow = (): PickerWindow => window as unknown as PickerWindow;

export function supportsFileHandles(): boolean {
  const w = pickerWindow();
  return typeof w.showOpenFilePicker === 'function' && typeof w.showSaveFilePicker === 'function';
}

const toPickerTypes = (types: readonly FileTypeSpec[]): PickerType[] =>
  types.map((t) => ({ description: t.description, accept: { [t.mime]: [...t.extensions] } }));

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

export interface OpenedFile {
  readonly file: File;
  /** Handle for saving back; null in the fallback path. */
  readonly handle: FileSystemFileHandle | null;
}

/** Asks for one file; null when the user cancels. */
export async function pickFile(types: readonly FileTypeSpec[]): Promise<OpenedFile | null> {
  const w = pickerWindow();
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: toPickerTypes(types), multiple: false });
      if (!handle) return null;
      return { file: await handle.getFile(), handle };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  const file = await inputPick(types.flatMap((t) => [t.mime, ...t.extensions]).join(','));
  return file ? { file, handle: null } : null;
}

function inputPick(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
    });
    input.addEventListener('cancel', () => {
      resolve(null);
    });
    input.click();
  });
}

export type SaveResult =
  | { readonly kind: 'saved'; readonly handle: FileSystemFileHandle | null }
  | { readonly kind: 'cancelled' };

/**
 * Writes `blob` to `handle`, or asks where to save it (`handle` null). Falls
 * back to a download when the picker API is missing.
 */
export async function saveFile(
  blob: Blob,
  suggestedName: string,
  handle: FileSystemFileHandle | null,
  types: readonly FileTypeSpec[],
): Promise<SaveResult> {
  const w = pickerWindow();
  try {
    let target = handle;
    if (!target && w.showSaveFilePicker) {
      target = await w.showSaveFilePicker({ types: toPickerTypes(types), suggestedName });
    }
    if (target) {
      const stream = await target.createWritable();
      await stream.write(blob);
      await stream.close();
      return { kind: 'saved', handle: target };
    }
  } catch (e) {
    if (isAbort(e)) return { kind: 'cancelled' };
    throw e;
  }
  download(blob, suggestedName);
  return { kind: 'saved', handle: null };
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/** Filesystem-safe file name stem (keeps letters in any script). */
export function safeFileName(name: string): string {
  const visible = Array.from(name, (c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('');
  const cleaned = visible
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'drawing';
}

export function stripExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}
