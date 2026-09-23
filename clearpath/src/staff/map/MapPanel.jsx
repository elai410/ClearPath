import { useEffect, useMemo, useState } from "react";
import { fetchPatientPlan, STATUS_LABELS } from "../../api/backend.js";
import PatientCard from "../../components/PatientCard.jsx";
import { Badge, Button } from "../../components/ui.jsx";
import { formatWait } from "../../lib/journey.js";
import { overlayLines, overlayVitals } from "./overlays.js";
import { kitInRoom, kitInZone, KIND_META, REQUESTABLE, controlLabel, itemTitle, visitHeadline } from "./equipment.js";

function VitalsBlock({ vitals, exception }) {
  if (!vitals?.watching || !vitals.vitals?.length) return null;
  return (
    <div className={`map-vitals ${exception ? "is-alert" : ""}`}>
      <p className="kicker" style={{ margin: 0 }}>{exception ? "Needs a look" : "Monitor"}</p>
      <div className="map-vitals-row">
        {vitals.vitals.map((v) => (
          <span key={v.measure} className={v.consequential ? "is-alert" : ""}>
            {v.measure === "pulse" ? "HR" : v.measure === "spo2" ? "SpO₂" : v.measure === "bp" ? "BP" : v.measure.toUpperCase()}
            {" "}{String(v.display || "").replace(/\s*(bpm|mmHg)\s*/gi, "")}
          </span>
        ))}
      </div>
    </div>
  );
}

function stopMap(e) {
  e.stopPropagation();
}

function PanelShell({ label, kicker, title, detail, onClose, onBack, backLabel, footer, children }) {
  return (
    <aside
      className="map-panel"
      aria-label={label}
      onWheel={stopMap}
      onPointerDown={stopMap}
    >
      <div className="map-panel-head">
        <div>
          {onBack && (
            <button type="button" className="map-panel-back" onClick={onBack}>
              {backLabel || "Back"}
            </button>
          )}
          {kicker && <p className="kicker" style={{ margin: 0 }}>{kicker}</p>}
          <h2>{title}</h2>
          {detail && <p className="small muted" style={{ margin: "3px 0 0" }}>{detail}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <div className="map-panel-scroll">{children}</div>
      {footer && <div className="map-panel-request">{footer}</div>}
    </aside>
  );
}

function PlanPeek({ patientId }) {
  const [plan, setPlan] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchPatientPlan(patientId)
      .then((d) => alive && setPlan(d))
      .catch(() => alive && setPlan(null));
    return () => { alive = false; };
  }, [patientId]);
  if (!plan) return null;
  return (
    <div className="map-plan-peek">
      <p className="kicker" style={{ margin: 0 }}>What's left</p>
      <p style={{ margin: "4px 0 0", fontWeight: 650 }}>
        About {plan.forecast?.p50} minutes from here
        {plan.blockedBy ? ` · waiting on ${plan.blockedBy.label}` : ""}
      </p>
      {plan.startableNow?.length > 0 && (
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Can do now: {plan.startableNow.map((s) => s.label).join(", ")}
        </p>
      )}
    </div>
  );
}

export function PatientPanel({ placement, floor, onRefresh, onClose, onBack, backLabel }) {
  const patient = placement.patient;
  if (placement.staff) {
    return (
      <PanelShell
        label={patient.name}
        kicker={placement.zone?.name || "Floor"}
        title={patient.name}
        detail={`${patient.stage_label || "On duty"}${placement.room ? ` · Room ${placement.room.label}` : ""}`}
        onClose={onClose}
        onBack={onBack}
        backLabel={backLabel}
      >
        <p className="small" style={{ margin: 0 }}>
          On duty. Not a patient.
        </p>
      </PanelShell>
    );
  }
  if (placement.companion) {
    return (
      <PanelShell
        label={patient.name}
        kicker={placement.zone.name}
        title={patient.name}
        detail={`${placement.slot.label}${placement.room ? ` · Room ${placement.room.label}` : ""}`}
        onClose={onClose}
        onBack={onBack}
        backLabel={backLabel}
      >
        <p className="small" style={{ margin: 0 }}>
          Family with {patient.visiting}.
        </p>
      </PanelShell>
    );
  }

  const lines = overlayLines(placement);
  const rec = floor?.control?.recommended?.patientId === patient.id ? floor.control.recommended : null;
  const opp = (patient.parallel || []).slice(0, 3);

  return (
    <PanelShell
      label={`${patient.name} on the map`}
      kicker={placement.zone.name}
      title={patient.name}
      detail={`${placement.slot.label}${placement.room ? ` · Room ${placement.room.label}` : ""} · ${STATUS_LABELS[patient.status] || patient.status}`}
      onClose={onClose}
      onBack={onBack}
      backLabel={backLabel}
    >
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <Badge tone={patient.urgency}>{patient.urgency}</Badge>
        {patient.is_stuck && <Badge tone="warn">Waiting too long</Badge>}
        {placement.exception && <Badge tone="danger">Vitals</Badge>}
      </div>

      <p className="small" style={{ margin: "0 0 10px" }}>
        {patient.now?.headline || lines[0]}
        {patient.now?.waitingFor
          && !String(patient.now.headline || "").toLowerCase().includes(String(patient.now.waitingFor).toLowerCase())
          ? ` Waiting on ${patient.now.waitingFor}.`
          : ""}
      </p>

      <VitalsBlock vitals={placement.vitals} exception={placement.exception} />

      {patient.action && (
        <div className="plan-note yes" style={{ marginBottom: 10 }}>
          <strong>{patient.action.label}</strong>
          <div className="small" style={{ marginTop: 2 }}>{patient.action.reason}</div>
        </div>
      )}

      {rec && (
        <div className="plan-note clock" style={{ marginBottom: 10 }}>
          <strong>{rec.title}</strong>
          <div className="small" style={{ marginTop: 2 }}>{rec.reason}</div>
        </div>
      )}

      {opp.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p className="kicker">Doesn't need them in the room</p>
          {opp.map((item) => (
            <p key={item.id || item.title} className="small" style={{ margin: "2px 0" }}>
              {item.title}
            </p>
          ))}
        </div>
      )}

      {patient.timeline && (
        <ol className="map-mini-timeline">
          {patient.timeline.map((step) => (
            <li key={step.id} className={step.state}>
              {step.staff || step.label}
            </li>
          ))}
        </ol>
      )}

      <PlanPeek patientId={patient.id} />

      <div style={{ marginTop: 12 }}>
        <PatientCard patient={patient} onRefresh={onRefresh} />
      </div>
    </PanelShell>
  );
}

export function AreaPanel({ area, resource, occupied, layer, onSelectPatient, onSelectAsset, onRequestKit, onClose }) {
  if (layer === "equipment") {
    return (
      <AreaEquipmentPanel
        area={area}
        resource={resource}
        occupied={occupied}
        onSelectPatient={onSelectPatient}
        onSelectAsset={onSelectAsset}
        onRequestKit={onRequestKit}
        onClose={onClose}
      />
    );
  }
  const title = resource?.label || area.name;
  const problems = area.occupants.filter((pl) => pl.flags.hot);
  const people = area.occupants.filter((pl) => !pl.staff);
  const staff = area.occupants.filter((pl) => pl.staff);
  return (
    <PanelShell
      label={title}
      kicker={area.kind === "clinical" ? "Beds" : area.kind === "waiting" ? "Waiting" : area.kind === "intake" ? "Intake" : area.kind}
      title={title}
      onClose={onClose}
    >
      <div className="map-area-stats">
        <div><b>{area.occupancy}/{area.capacity}</b><span>Patients / slots</span></div>
        <div><b>{area.waiting}</b><span>Waiting</span></div>
        <div><b>{area.avgWait}m</b><span>Avg wait</span></div>
        <div className={area.congestion !== "steady" ? "is-alert" : ""}>
          <b>{area.congestion}</b><span>Queue</span>
        </div>
      </div>
      <p className="small muted" style={{ margin: "0 0 8px" }}>
        {area.resources.beds ? `${area.resources.beds} beds` : "No beds"}
        {area.resources.seats ? ` · ${area.resources.seats} seats` : ""}
        {area.resources.treatment ? ` · ${area.resources.treatment} treatment bays` : ""}
        {area.stuck ? ` · ${area.stuck} past expected wait` : ""}
      </p>
      {area.prediction && (
        <div className="plan-note clock" style={{ margin: "0 0 10px" }}>
          <strong>{area.prediction.title}</strong>
          <div className="small" style={{ marginTop: 2 }}>{area.prediction.detail}</div>
        </div>
      )}
      {problems.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p className="kicker">Needs attention</p>
          {problems.map((pl) => (
            <button
              key={pl.patient.id}
              type="button"
              className="map-person-hit"
              onClick={() => onSelectPatient(pl.patient.id)}
            >
              <strong>{pl.patient.name}</strong>
              <span>{pl.slot.label} · {overlayLines(pl)[0]}{overlayVitals(pl) ? ` · ${overlayVitals(pl).text}` : ""}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        <p className="kicker">Here now</p>
        {people.length === 0 && <p className="small muted">No patients in this area.</p>}
        {people.map((pl) => (
          <button
            key={pl.patient.id}
            type="button"
            className="map-person-hit"
            onClick={() => onSelectPatient(pl.patient.id)}
          >
            <strong>{pl.patient.name}</strong>
            <span>
              {pl.slot.label} · {STATUS_LABELS[pl.patient.status] || pl.patient.status} · {formatWait(pl.patient.wait_minutes)}
              {overlayVitals(pl) ? ` · ${overlayVitals(pl).text}` : ""}
            </span>
          </button>
        ))}
      </div>
      {staff.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p className="kicker">Staff in the room</p>
          {staff.map((pl) => (
            <button
              key={pl.patient.id}
              type="button"
              className="map-person-hit"
              onClick={() => onSelectPatient(pl.patient.id)}
            >
              <strong>{pl.patient.name}</strong>
              <span>{pl.patient.stage_label || "On duty"}</span>
            </button>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

export function RoomPanel({ room, occupied, layer, onSelectPatient, onSelectAsset, onRequestKit, onClose }) {
  const area = occupied.areas.find((a) => a.id === room.zoneId);
  const here = occupied.placements.filter((pl) => pl.slot.roomId === room.id);
  const beds = occupied.layout.slots.filter((s) => s.roomId === room.id && (s.kind === "bed" || s.kind === "treatment")).length;
  const synthetic = area ? { ...area, name: `Room ${room.label}`, occupants: here, occupancy: here.filter((pl) => !pl.companion).length, capacity: Math.max(beds, 1) } : null;
  if (!synthetic) return null;
  return (
    <AreaPanel
      area={synthetic}
      resource={{ label: `Room ${room.label}`, roomId: room.id }}
      occupied={occupied}
      layer={layer}
      onSelectPatient={onSelectPatient}
      onSelectAsset={onSelectAsset}
      onRequestKit={onRequestKit}
      onClose={onClose}
    />
  );
}

export function ResourcePanel({ station, occupied, layer, onSelectPatient, onSelectAsset, onRequestKit, onClose }) {
  const area = occupied.areas.find((a) => a.id === station.zoneId) || occupied.areas[0];
  return (
    <AreaPanel
      area={area}
      resource={station}
      occupied={occupied}
      layer={layer}
      onSelectPatient={onSelectPatient}
      onSelectAsset={onSelectAsset}
      onRequestKit={onRequestKit}
      onClose={onClose}
    />
  );
}

const STATUS_COPY = {
  available: "Available",
  "in-use": "In use",
  requested: "On the way",
  needed: "Short",
};

function kitStatus(item) {
  return STATUS_COPY[item.status] || item.status;
}

function needStatus(req) {
  if (req.status === "needed") return "Short";
  if (req.status === "pulling") return "On the way";
  if (req.status === "fulfilled") return "In the room";
  return req.status;
}

function RequestKitList({ roomId, zoneId, occupied, onRequestKit }) {
  const pending = new Set(
    (occupied.equipment?.requests || [])
      .filter((r) => (
        (roomId ? r.roomId === roomId : r.zoneId === zoneId && !r.roomId)
        && (r.status === "pulling" || r.status === "needed")
      ))
      .map((r) => r.kind),
  );
  const here = roomId ? kitInRoom(occupied.equipment, roomId) : kitInZone(occupied.equipment, zoneId);
  const availableHere = new Set(here.filter((i) => i.status === "available" && !i.ghost).map((i) => i.kind));

  return (
    <div className="map-request-list">
      {REQUESTABLE.map((kind) => {
        const busy = pending.has(kind);
        const onHand = availableHere.has(kind);
        return (
          <button
            key={kind}
            type="button"
            className="map-request-hit"
            disabled={busy}
            onClick={() => onRequestKit?.({ kind, roomId: roomId || null, zoneId })}
          >
            <strong>{KIND_META[kind].label}</strong>
            <span>{busy ? "Already asked for" : onHand ? "In this room" : "Bring to this room"}</span>
          </button>
        );
      })}
    </div>
  );
}

function AreaEquipmentPanel({ area, resource, occupied, onSelectPatient, onSelectAsset, onRequestKit, onClose }) {
  const [requesting, setRequesting] = useState(false);
  const title = resource?.label || area.name;
  const roomId = resource?.roomId || null;
  const kit = roomId
    ? kitInRoom(occupied.equipment, roomId)
    : kitInZone(occupied.equipment, area.id);
  const requests = (occupied.equipment?.requests || []).filter((req) => (
    roomId ? req.roomId === roomId : req.zoneId === area.id && !req.roomId
  ));
  const needs = requests.filter((r) => r.status === "pulling" || r.status === "needed");
  const visits = (occupied.placements || []).filter((pl) => (
    !pl.staff && !pl.companion && (roomId ? pl.room?.id === roomId : pl.zone.id === area.id && !pl.room)
  ));
  const available = kit.filter((i) => i.status === "available" && !i.ghost).length;
  const live = kit.filter((i) => i.status === "in-use" || i.status === "requested").length;

  function request(payload) {
    onRequestKit?.(payload);
    setRequesting(false);
  }

  return (
    <PanelShell
      label={title}
      kicker="Equipment"
      title={title}
      detail={`${kit.filter((i) => !i.ghost).length} in this room`}
      onClose={onClose}
      footer={onRequestKit ? (
        <Button
          variant={requesting ? "ghost" : ""}
          size="sm"
          block
          onClick={() => setRequesting((v) => !v)}
        >
          {requesting ? "Cancel" : "Request equipment"}
        </Button>
      ) : null}
    >
      {requesting && (
        <div style={{ marginBottom: 10 }}>
          <p className="kicker">Ask for</p>
          <p className="small muted" style={{ margin: "0 0 6px" }}>
            From the closet or another unit. Skip it if it's already on the way.
          </p>
          <RequestKitList
            roomId={roomId}
            zoneId={area.id}
            occupied={occupied}
            onRequestKit={request}
          />
        </div>
      )}
      <div className="map-area-stats">
        <div><b>{available}</b><span>Available</span></div>
          <div><b>{live}</b><span>In use / on the way</span></div>
          <div><b>{needs.length}</b><span>Still needed</span></div>
        <div><b>{kit.filter((i) => i.status === "needed").length}</b><span>Short</span></div>
      </div>

      <div style={{ marginTop: 6 }}>
        <p className="kicker">Required supplies</p>
        {needs.length === 0 && <p className="small muted">Nothing extra for the visit.</p>}
        {needs.map((req) => (
          <button
            key={req.id}
            type="button"
            className="map-person-hit"
            onClick={() => req.assetId && onSelectAsset?.(req.assetId)}
          >
            <strong>{req.label}</strong>
            <span>{needStatus(req)} · {req.why}{req.patientName ? ` · ${req.patientName}` : ""}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 6 }}>
        <p className="kicker">Who's in this room</p>
        {visits.length === 0 && <p className="small muted">Nobody in this room.</p>}
        {visits.map((pl) => (
          <button
            key={pl.patient.id}
            type="button"
            className="map-person-hit"
            onClick={() => onSelectPatient?.(pl.patient.id)}
          >
            <strong>{visitHeadline(pl.patient)}</strong>
            <span>{pl.patient.name} · {pl.slot.label}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 6 }}>
        <p className="kicker">Here now</p>
        {kit.length === 0 && <p className="small muted">No equipment listed here.</p>}
        {kit.map((item) => (
          <button
            key={item.id}
            type="button"
            className="map-person-hit"
            onClick={() => onSelectAsset?.(item.id)}
          >
            <strong>{itemTitle(item)}</strong>
            <span>{kitStatus(item)}{item.request ? ` · ${item.request.patientName}` : controlLabel(item) ? ` · ${controlLabel(item)}` : ""}</span>
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

export function EquipmentPanel({ item, onClose, onBack, backLabel }) {
  const req = item.request;
  return (
    <PanelShell
      label={item.label}
      kicker={item.ghost ? "Need" : "Equipment"}
      title={itemTitle(item)}
      detail={[controlLabel(item), kitStatus(item)].filter(Boolean).join(" · ")}
      onClose={onClose}
      onBack={onBack}
      backLabel={backLabel}
    >
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <Badge tone={item.status === "needed" ? "danger" : item.status === "requested" ? "warn" : ""}>
          {kitStatus(item)}
        </Badge>
        {item.fixture && <Badge>In this room</Badge>}
        {item.ghost && <Badge tone="danger">No unit free</Badge>}
      </div>
      <p className="small" style={{ margin: "0 0 10px" }}>
        {req
          ? `${req.why} in ${req.roomLabel}. Needed for this visit — already on the list.`
          : item.destLabel
            ? `Assigned to ${item.destLabel}.`
            : `Stored here.`}
      </p>
      {req && (
        <div className="plan-note clock" style={{ marginBottom: 10 }}>
          <strong>{req.patientName}</strong>
          <div className="small" style={{ marginTop: 2 }}>
            {req.slotLabel} · {req.roomLabel}
          </div>
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Last seen here.
      </p>
    </PanelShell>
  );
}

export function FindEquipment({ items, onPick }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return (items || [])
      .filter((item) => (
        [item.label, item.control, controlLabel(item), item.kind, item.destLabel, item.request?.patientName, item.request?.roomLabel]
          .some((v) => String(v || "").toLowerCase().includes(s))
      ))
      .slice(0, 8);
  }, [q, items]);

  return (
    <div className="lookup-bar" id="lookup">
      <input
        className="field"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, room, or control number"
        aria-label="Look up equipment"
        autoComplete="off"
      />
      {hits.length > 0 && (
        <div className="lookup-hits">
          {hits.map((item) => (
            <button
              key={item.id}
              type="button"
              className="work-copy"
              onClick={() => { onPick?.(item); setQ(""); }}
              style={{ padding: "8px 0" }}
            >
              <span className="work-title">{itemTitle(item)}</span>
              <span className="small muted">{kitStatus(item)}{controlLabel(item) ? ` · ${controlLabel(item)}` : ""}{item.request ? ` · ${item.request.patientName}` : ""}</span>
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && !hits.length && <p className="small muted" style={{ margin: "8px 0 0" }}>No match.</p>}
    </div>
  );
}

export function resolveSelection(selection, occupied) {
  if (!selection) return null;
  if (selection.type === "patient") {
    return occupied.placements.find((pl) => pl.patient.id === selection.id) || null;
  }
  if (selection.type === "zone") {
    return occupied.areas.find((a) => a.id === selection.id) || null;
  }
  if (selection.type === "room") {
    return occupied.layout.rooms.find((r) => r.id === selection.id) || null;
  }
  if (selection.type === "resource") {
    return occupied.layout.stations.find((s) => s.id === selection.id) || null;
  }
  if (selection.type === "asset") {
    return occupied.equipment?.items.find((i) => i.id === selection.id) || null;
  }
  return null;
}
