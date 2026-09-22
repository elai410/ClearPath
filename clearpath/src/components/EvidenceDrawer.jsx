import { useEffect, useState } from "react";
import { fetchLineage } from "../api/backend.js";
import { Modal } from "./ui.jsx";

/**
 * The same explanation, wherever a ClearPath value appears.
 * Source, extraction, and correction stay in order. A later verification
 * does not erase the earlier reading.
 */
export function EvidenceDrawer({ claimId, onClose }) {
  const [chain, setChain] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchLineage(claimId)
      .then((data) => alive && setChain(data.chain))
      .catch(() => alive && setChain([]));
    return () => { alive = false; };
  }, [claimId]);

  const current = chain?.find((node) => node.id === claimId);

  return (
    <Modal title="Why am I seeing this?" onClose={onClose}>
      {!chain && <p className="small muted">Loading the chain…</p>}
      {chain && !current && <p className="small muted">This value has no evidence chain.</p>}
      {current && (
        <div className="stack" style={{ gap: 14 }}>
          <div>
            <p className={`ep ${current.epistemic?.tone || "candidate"}`}>{current.epistemic?.label}</p>
            <h3 style={{ margin: "4px 0 0", fontSize: 22 }}>{current.display}</h3>
            <p className="small muted" style={{ margin: "6px 0 0" }}>{current.authority?.reason}</p>
          </div>
          <div>
            <p className="kicker">How this value was produced</p>
            <ol className="lineage">
              {chain.map((node) => (
                <li key={node.id} className={node.id === claimId ? "current" : ""}>
                  <span className={`ep ${node.epistemic?.tone || "candidate"}`}>{node.epistemic?.label}</span>
                  <strong>{node.display}</strong>
                  {node.evidence?.quote && <span className="small">“{node.evidence.quote}”</span>}
                  {node.verified_by && <span className="small muted">by {node.verified_by}</span>}
                </li>
              ))}
            </ol>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {current.epistemic?.tone === "fact"
              ? "A person verified this measurement. It is still not an order and it does not change treatment by itself."
              : "This has not been verified. It is visible here and it is not being used to move care."}
          </p>
        </div>
      )}
    </Modal>
  );
}
