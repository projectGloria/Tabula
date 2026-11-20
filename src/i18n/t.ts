import { en, type I18nKey } from './en';

export type I18nParams = Readonly<Record<string, string | number>>;

const table: Readonly<Record<I18nKey, string>> = en;

/** Translates `key`, replacing `{name}` placeholders. Unknown params are left as-is. */
export function t(key: I18nKey, params?: I18nParams): string {
  const template = table[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export type { I18nKey };
