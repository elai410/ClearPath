import { useState } from "react";
import { aiConcierge } from "../api/backend.js";
import { Button } from "./ui.jsx";

export default function Concierge({ patientId, questions = [], hint }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([]);

  async function ask(text) {
    const question = (text || q).trim();
    if (!question || busy) return;
    setQ("");
    setOpen(true);
    setThread((t) => [...t, { role: "user", content: question }]);
    setBusy(true);
    try {
      const res = await aiConcierge(patientId, question);
      setThread((t) => [...t, { role: "assistant", content: res.text, source: res.source }]);
    } catch {
      setThread((t) => [...t, { role: "assistant", content: "I couldn't reach the guide just now. Try again in a moment." }]);
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <p className="kicker">Ask ClearPath</p>
      <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Not sure what's happening?</h3>
      <p className="small muted">
        {hint || "This guide can explain the wait and help you phrase questions for your care team. It doesn't diagnose."}
      </p>
      {questions.length > 0 && (
        <div className="chips" style={{ justifyContent: "flex-start", marginTop: 12 }}>
          {questions.slice(0, 3).map((item) => (
            <button key={item} className="chip" type="button" onClick={() => ask(item)}>{item}</button>
          ))}
        </div>
      )}
      {(open || thread.length > 0) && (
        <div className="chat" style={{ maxHeight: 220, marginTop: 12 }}>
          {thread.map((m, i) => (
            <div key={i} className={`bubble ${m.role === "user" ? "user" : "bot"}`}>{m.content}</div>
          ))}
          {busy && (
            <div className="bubble bot"><span className="typing"><i /><i /><i /></span></div>
          )}
        </div>
      )}
      <div className="composer" style={{ marginTop: 12 }}>
        <textarea
          className="field"
          rows={2}
          placeholder="Ask about the wait, what happens next, or how to talk to your team…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <Button onClick={() => ask()} disabled={busy || !q.trim()} aria-label="Send">Ask</Button>
      </div>
    </section>
  );
}
