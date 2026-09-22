import { useState } from "react";
import { useLang } from "../lib/i18n/LanguageContext.jsx";
import { Button } from "./ui.jsx";

export function LanguageSwitcher() {
  const { rendered, languages, choose, t } = useLang();

  return (
    <label className="lang-switch">
      <span className="sr-only">{t("ui.lang.label")}</span>
      <select
        value={rendered}
        onChange={(e) => choose(e.target.value)}
        aria-label={t("ui.lang.label")}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Shown when the patient's language is one we cannot fully render. The offer is
 * a real human, not a better machine translation: the point is to be honest
 * that this page is in English rather than let someone guess at their own care.
 */
export function InterpreterOffer({ onRequest }) {
  const { t, supported, full, requestedLabel } = useLang();
  const [state, setState] = useState("idle");

  if (supported && full) return null;
  if (state === "done") {
    return (
      <div className="interpreter-note" role="status">
        {t("interpreter.requested")}
      </div>
    );
  }

  async function request() {
    setState("sending");
    try {
      await onRequest?.(requestedLabel);
      setState("done");
    } catch {
      // The desk can still be asked in person, so say that rather than fail silently.
      setState("error");
    }
  }

  return (
    <aside className="interpreter-offer">
      <p className="kicker" style={{ margin: 0 }}>{t("interpreter.banner.title")}</p>
      <p className="small" style={{ margin: "6px 0 10px" }}>
        {t("interpreter.banner.body", { language: requestedLabel })}
      </p>
      <Button size="sm" onClick={request} disabled={state === "sending"}>
        {t("interpreter.banner.cta", { language: requestedLabel })}
      </Button>
      {state === "error" && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          {t("wyw.interpreter")}
        </p>
      )}
    </aside>
  );
}
