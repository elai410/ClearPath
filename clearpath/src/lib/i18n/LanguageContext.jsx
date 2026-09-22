import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SUPPORTED_LANGUAGES, resolveLanguage, translator } from "./index.js";

const LanguageContext = createContext(null);
const STORAGE_KEY = "clearpath.lang";

function stored() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function LanguageProvider({ children }) {
  const initial = stored();
  const [requested, setRequested] = useState(initial || "en");
  // An explicit choice outranks detection forever. Re-detecting on every
  // message would yank the page back and forth for anyone who code-switches.
  const [explicit, setExplicit] = useState(Boolean(initial));

  const choose = useCallback((raw) => {
    const next = raw || "en";
    setRequested(next);
    setExplicit(true);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the choice still holds for this session */
    }
  }, []);

  const suggest = useCallback(
    (raw) => {
      if (explicit || !raw || raw === "en") return;
      setRequested(raw);
    },
    [explicit]
  );

  /** Shared kiosks must not leak one patient's language into the next visit. */
  const reset = useCallback(() => {
    setRequested("en");
    setExplicit(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing persisted to clear */
    }
  }, []);

  const lang = useMemo(() => resolveLanguage(requested), [requested]);
  const t = useMemo(() => translator(lang.rendered), [lang.rendered]);

  useEffect(() => {
    document.documentElement.lang = lang.rendered;
    document.documentElement.dir = lang.dir;
  }, [lang.rendered, lang.dir]);

  const value = useMemo(
    () => ({ ...lang, t, choose, suggest, reset, explicit, languages: SUPPORTED_LANGUAGES }),
    [lang, t, choose, suggest, reset, explicit]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used inside a LanguageProvider");
  return ctx;
}
