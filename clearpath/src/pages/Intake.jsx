import { useEffect, useRef, useState } from "react";
import { converse } from "../api/backend.js";
import { Button } from "../components/ui.jsx";
import { useLang } from "../lib/i18n/LanguageContext.jsx";
import { detectLanguage } from "../lib/i18n/index.js";

const STARTER_KEYS = ["chest", "fever", "bite", "wrist", "mri"];

export default function Intake({ onRouted }) {
  const { t, suggest } = useLang();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    setInput("");
    setStarted(true);
    // Switch the page to the language the patient is actually writing in, before
    // the reply comes back, so the routing explanation arrives already readable.
    suggest(detectLanguage(text));
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const data = await converse(newMessages);
      if (data.mode === "question") {
        setMessages((prev) => [...prev, { role: "assistant", content: data.question }]);
      } else if (data.mode === "route") {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reason, isRouting: true }]);
        setTimeout(() => onRouted(data, newMessages), 900);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "I'm having trouble connecting. Please try again — you can also go to Admitting on the first floor of East Pavilion.",
      }]);
    }
    setLoading(false);
  }

  return (
    <div className="stack">
      {!started && (
        <div className="intro">
          <span className="logo-mark" style={{ margin: "0 auto 4px", width: 44, height: 44, fontSize: 22 }}>＋</span>
          <p className="kicker">Yale New Haven Hospital</p>
          <h2>{t("ui.heading")}</h2>
          <p>{t("ui.sub")}</p>
        </div>
      )}

      {messages.length > 0 && (
        <div className="chat" role="log" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role === "user" ? "user" : m.isRouting ? "bot route" : "bot"}`}>
              {m.isRouting ? `We'll take you there. ${m.content}` : m.content}
            </div>
          ))}
          {loading && (
            <div className="bubble bot"><span className="typing"><i /><i /><i /></span></div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {!started && (
        <div className="chips">
          {STARTER_KEYS.map((key) => {
            const phrase = t(`ui.starter.${key}`);
            return (
              <button key={key} className="chip" type="button" onClick={() => sendMessage(phrase)}>
                {phrase}
              </button>
            );
          })}
        </div>
      )}

      <div className="composer">
        <textarea
          className="field"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder={started ? t("ui.placeholderAnswer") : t("ui.placeholder")}
          rows={2}
          disabled={loading}
          aria-label={t("ui.heading")}
        />
        <Button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} aria-label={t("ui.btn.continue")}>
          {t("ui.btn.continue")}
        </Button>
      </div>
      <p className="small muted" style={{ textAlign: "center" }}>{t("ui.disclaimer")}</p>
    </div>
  );
}
