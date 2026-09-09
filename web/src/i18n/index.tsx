// React binding for the message catalogue in ./messages. A provider and its
// hook belong together, so this file exports both — Fast Refresh's
// "components only" rule is knowingly waived here.
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { detectLocale, translate, type Locale, type MessageKey, type Vars } from "./messages";

export type { Locale, MessageKey } from "./messages";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useT(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx === null) throw new Error("useT must be used within <LocaleProvider>");
  return ctx;
}
