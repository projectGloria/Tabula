import type { CommandId } from '../actions/commands';

/**
 * Key combos are written as `Mod+Shift+Alt+<Key>` and matched against the
 * *physical* key (`KeyboardEvent.code`) so they work on every layout.
 * `Mod` is Ctrl on Windows/Linux and ⌘ on macOS.
 */
export interface KeyCombo {
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly code: string;
}

export interface KeyBinding {
  readonly combo: string;
  readonly command: CommandId;
}

/** Structural subset of KeyboardEvent so core stays DOM-free and testable. */
export interface KeyEventLike {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const NAMED_CODES: Readonly<Record<string, string>> = {
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Esc: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  '/': 'Slash',
  "'": 'Quote',
  '=': 'Equal',
  '-': 'Minus',
  ',': 'Comma',
  '.': 'Period',
  '[': 'BracketLeft',
  ']': 'BracketRight',
};

/** Human-readable labels for codes (used by the shortcut dialog / tooltips). */
const CODE_LABELS: Readonly<Record<string, string>> = {
  Slash: '/',
  Quote: "'",
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  BracketLeft: '[',
  BracketRight: ']',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export function keyTokenToCode(token: string): string {
  if (/^[a-z]$/i.test(token)) return `Key${token.toUpperCase()}`;
  if (/^[0-9]$/.test(token)) return `Digit${token}`;
  if (/^F([1-9]|1[0-2])$/.test(token)) return token;
  const named = NAMED_CODES[token];
  if (named === undefined) throw new Error(`Unknown key token: "${token}"`);
  return named;
}

export function parseCombo(combo: string): KeyCombo {
  // Split on '+' but allow a literal '+' key at the end (e.g. "Mod++").
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
  let mod = false;
  let shift = false;
  let alt = false;
  let key: string | undefined;
  for (const raw of parts) {
    const part = raw.trim();
    if (part === 'Mod') mod = true;
    else if (part === 'Shift') shift = true;
    else if (part === 'Alt') alt = true;
    else if (key === undefined) key = part;
    else throw new Error(`Combo has more than one key: "${combo}"`);
  }
  if (key === undefined || key === '') throw new Error(`Combo has no key: "${combo}"`);
  const code = key === '+' ? 'Equal' : keyTokenToCode(key);
  return { mod, shift, alt, code };
}

export function comboId(c: KeyCombo): string {
  return `${c.mod ? 'M' : ''}${c.shift ? 'S' : ''}${c.alt ? 'A' : ''}:${c.code}`;
}

export function eventMatchesCombo(e: KeyEventLike, c: KeyCombo, isMac: boolean): boolean {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const otherCtl = isMac ? e.ctrlKey : e.metaKey;
  return (
    e.code === c.code && mod === c.mod && !otherCtl && e.shiftKey === c.shift && e.altKey === c.alt
  );
}

export function formatCombo(c: KeyCombo, isMac: boolean): string {
  const key = c.code.startsWith('Key')
    ? c.code.slice(3)
    : c.code.startsWith('Digit')
      ? c.code.slice(5)
      : (CODE_LABELS[c.code] ?? c.code);
  if (isMac) return `${c.mod ? '⌘' : ''}${c.alt ? '⌥' : ''}${c.shift ? '⇧' : ''}${key}`;
  return [c.mod ? 'Ctrl' : '', c.shift ? 'Shift' : '', c.alt ? 'Alt' : '', key]
    .filter(Boolean)
    .join('+');
}

interface CompiledBinding {
  readonly binding: KeyBinding;
  readonly combo: KeyCombo;
}

export class Keymap {
  private readonly compiled: readonly CompiledBinding[];

  constructor(
    bindings: readonly KeyBinding[],
    private readonly isMac: boolean,
  ) {
    this.compiled = bindings.map((binding) => ({ binding, combo: parseCombo(binding.combo) }));
  }

  match(e: KeyEventLike): CommandId | undefined {
    return this.compiled.find((c) => eventMatchesCombo(e, c.combo, this.isMac))?.binding.command;
  }

  /** Display label of the first combo bound to `command`, if any. */
  shortcutFor(command: CommandId): string | undefined {
    const hit = this.compiled.find((c) => c.binding.command === command);
    return hit ? formatCombo(hit.combo, this.isMac) : undefined;
  }

  bindings(): readonly KeyBinding[] {
    return this.compiled.map((c) => c.binding);
  }
}

/** Returns combo strings that are bound more than once (should always be empty). */
export function findConflicts(bindings: readonly KeyBinding[]): string[] {
  const seen = new Map<string, number>();
  for (const b of bindings) {
    const id = comboId(parseCombo(b.combo));
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  return bindings
    .filter((b) => (seen.get(comboId(parseCombo(b.combo))) ?? 0) > 1)
    .map((b) => b.combo);
}

/** Structural element shape used to decide whether shortcuts must be suppressed. */
export interface TargetLike {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

/** Shortcuts never fire while typing in inputs, textareas or contenteditable. */
export function isEditableTarget(target: TargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = target.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
