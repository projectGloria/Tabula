import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from './bindings';
import {
  findConflicts,
  formatCombo,
  isEditableTarget,
  Keymap,
  parseCombo,
  type KeyEventLike,
} from './keymap';

const ev = (code: string, mods: Partial<Omit<KeyEventLike, 'code'>> = {}): KeyEventLike => ({
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('parseCombo', () => {
  it('parses modifiers and maps keys to physical codes', () => {
    expect(parseCombo('Mod+Shift+D')).toEqual({ mod: true, shift: true, alt: false, code: 'KeyD' });
    expect(parseCombo('Shift+1')).toEqual({ mod: false, shift: true, alt: false, code: 'Digit1' });
    expect(parseCombo("Mod+'")).toMatchObject({ mod: true, code: 'Quote' });
    expect(parseCombo('Mod+/')).toMatchObject({ code: 'Slash' });
    expect(parseCombo('Escape').code).toBe('Escape');
  });

  it('rejects malformed combos', () => {
    expect(() => parseCombo('Mod+')).toThrow();
    expect(() => parseCombo('A+B')).toThrow();
    expect(() => parseCombo('Hyper')).toThrow();
  });
});

describe('Keymap', () => {
  const win = new Keymap(DEFAULT_BINDINGS, false);
  const mac = new Keymap(DEFAULT_BINDINGS, true);

  it('matches plain keys exactly (no extra modifiers)', () => {
    expect(win.match(ev('KeyV'))).toBe('tool.select');
    expect(win.match(ev('KeyR'))).toBe('tool.rectangle');
    expect(win.match(ev('KeyR', { ctrlKey: true }))).toBeUndefined();
    expect(win.match(ev('KeyR', { shiftKey: true }))).toBeUndefined();
  });

  it('maps Mod to Ctrl on Windows and ⌘ on macOS', () => {
    expect(win.match(ev('KeyD', { ctrlKey: true, shiftKey: true }))).toBe('debug.toggle');
    expect(win.match(ev('KeyD', { metaKey: true, shiftKey: true }))).toBeUndefined();
    expect(mac.match(ev('KeyD', { metaKey: true, shiftKey: true }))).toBe('debug.toggle');
    expect(mac.match(ev('KeyD', { ctrlKey: true, shiftKey: true }))).toBeUndefined();
  });

  it('formats shortcuts per platform', () => {
    expect(formatCombo(parseCombo('Mod+Shift+D'), false)).toBe('Ctrl+Shift+D');
    expect(formatCombo(parseCombo('Mod+Shift+D'), true)).toBe('⌘⇧D');
    expect(win.shortcutFor('tool.rectangle')).toBe('R');
  });

  it('has no conflicting default bindings', () => {
    expect(findConflicts(DEFAULT_BINDINGS)).toEqual([]);
    expect(
      findConflicts([
        { combo: 'Mod+A', command: 'tool.select' },
        { combo: 'Mod+a', command: 'tool.rectangle' },
      ]),
    ).toHaveLength(2);
  });
});

describe('isEditableTarget', () => {
  it('suppresses shortcuts in text fields', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'CANVAS' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
