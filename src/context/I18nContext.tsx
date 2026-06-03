import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import enUS from '../lang/en-US.json';
import zhCN from '../lang/zh-CN.json';

const STORAGE_KEY = 'socialflow.locale';
export type LocaleCode = 'zh-CN' | 'en-US';
const DEFAULT_LOCALE: LocaleCode = 'zh-CN';
const messages: Record<LocaleCode, Record<string, string>> = {
  'zh-CN': zhCN as Record<string, string>,
  'en-US': enUS as Record<string, string>,
};
const LOCALE_OPTIONS: Array<{ value: LocaleCode; label: string }> = [
  { value: 'zh-CN', label: messages['zh-CN']['locale.zhCN'] ?? 'zh-CN' },
  { value: 'en-US', label: messages['en-US']['locale.enUS'] ?? 'en-US' },
];
const DAYJS_LOCALES: Record<LocaleCode, string> = {
  'zh-CN': 'zh-cn',
  'en-US': 'en',
};

dayjs.extend(relativeTime);

type I18nContextType = {
  locale: LocaleCode;
  setLocale: (next: LocaleCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  availableLocales: Array<{ value: LocaleCode; label: string }>;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function isLocaleCode(value: string): value is LocaleCode {
  return LOCALE_OPTIONS.some((it) => it.value === value);
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && isLocaleCode(cached)) {
      dayjs.locale(DAYJS_LOCALES[cached]);
      return cached;
    }
    dayjs.locale(DAYJS_LOCALES[DEFAULT_LOCALE]);
    return DEFAULT_LOCALE;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    dayjs.locale(DAYJS_LOCALES[locale]);
  }, [locale]);

  const value = useMemo<I18nContextType>(() => {
    const table = messages[locale] ?? messages[DEFAULT_LOCALE];
    const fallbackTable = messages[DEFAULT_LOCALE];
    return {
      locale,
      setLocale: (next) => setLocaleState(next),
      t: (key, params) => {
        const raw = table[key] ?? fallbackTable[key] ?? key;
        if (!params) return raw;
        return Object.entries(params).reduce(
          (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)),
          raw
        );
      },
      availableLocales: LOCALE_OPTIONS,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextType => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
};
