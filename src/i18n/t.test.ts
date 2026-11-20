import { describe, expect, it } from 'vitest';
import { t } from './t';

describe('t', () => {
  it('returns plain strings', () => {
    expect(t('tool.rectangle')).toBe('Rectangle');
  });

  it('interpolates params and leaves unknown placeholders intact', () => {
    expect(t('debug.elements', { visible: 3, total: 10 })).toBe('Elements 3 / 10');
    expect(t('debug.elements', { visible: 3 })).toBe('Elements 3 / {total}');
  });
});
