import { useMemo, useState } from "react";
import { occupyFloor, onThisFloor, placementByPatient } from "./bind.js";
import { assetById, sectionForItem } from "./equipment.js";
import { areaJumps, layoutFor } from "./layout.js";
import HospitalScene from "./HospitalScene.jsx";
import {
  AreaPanel,
  EquipmentPanel,
  FindEquipment,
  PatientPanel,
  ResourcePanel,
  RoomPanel,
} from "./MapPanel.jsx";
import { FindPerson } from "../WorkRow.jsx";
import { rankPlacements } from "./overlays.js";

function shortName(name) {
  return name
    .replace("Adult Emergency waiting", "ED waiting")
    .replace("Adult Emergency bays", "ED bays")
    .replace("Fitkin nurse station", "Nurse station")
    .replace("Ophthalmology · Dana", "Ophthalmology")
    .replace("Diagnostics · Clinic", "Diagnostics")
    .replace("Imaging · MRI", "MRI");
}

export default function CommandMap({ flow, agent, floor, onRefresh }) {
  const [level, setLevel] = useState(1);
  const [layer, setLayer] = useState("people");
  const [selection, setSelection] = useState(null);
  const [zoom, setZoom] = useState("mid");
  const [focus, setFocus] = useState({ target: null, nonce: 0 });
  const [indicated, setIndicated] = useState([]);

  const layout = layoutFor(level);
  const occupied = useMemo(
    () => occupyFloor(flow?.patients || [], { agent, flow, floor, indicated }, layout),
    [flow, agent, floor, layout, indicated],
  );
  const ranks = useMemo(
    () => Object.fromEntries(rankPlacements(occupied.placements.filter((pl) => !pl.companion && !pl.staff))),
    [occupied],
  );
  const jumps = useMemo(() => areaJumps(layout), [layout]);
  const visiblePatients = useMemo(
    () => (flow?.patients || []).filter((p) => onThisFloor(p, layout)),
    [flow, layout],
  );
  const equipment = occupied.equipment;
  const kitLayer = layer === "equipment";

  function flyHome() {
    setFocus((prev) => ({ target: { overview: true }, nonce: prev.nonce + 1 }));
  }

  function flyTo(x, z, y = 16) {
    setFocus((prev) => ({ target: { x, y, z }, nonce: prev.nonce + 1 }));
  }

  function select(next) {
    setSelection((prev) => {
      if (!next) return null;
      const fromList = prev && (prev.type === "zone" || prev.type === "room" || prev.type === "resource");
      const intoItem = next.type === "patient" || next.type === "asset";
      if (fromList && intoItem) {
        return { ...next, from: { type: prev.type, id: prev.id } };
      }
      return next;
    });
    if (!next) return;
    if (next.type === "patient") {
      const pl = placementByPatient(occupied, next.id);
      if (pl) flyTo(pl.slot.x, pl.slot.z, 12);
    } else if (next.type === "zone") {
      const area = occupied.areas.find((a) => a.id === next.id);
      if (area) flyTo(area.x, area.z, 15);
    } else if (next.type === "room") {
      const room = layout.rooms.find((r) => r.id === next.id);
      if (room) flyTo(room.x, room.z, 11);
    } else if (next.type === "resource") {
      const station = layout.stations.find((s) => s.id === next.id);
      if (station) flyTo(station.x, station.z, 12);
    } else if (next.type === "asset") {
      const item = assetById(equipment, next.id);
      if (item) flyTo(item.x, item.z, 11);
    }
  }

  function backLabelFor(from) {
    if (!from) return "Back";
    if (from.type === "zone") {
      const area = occupied.areas.find((a) => a.id === from.id);
      return area ? `Back to ${shortName(area.name)}` : "Back";
    }
    if (from.type === "room") {
      const room = layout.rooms.find((r) => r.id === from.id);
      return room ? `Back to Room ${room.label}` : "Back";
    }
    if (from.type === "resource") {
      const station = layout.stations.find((s) => s.id === from.id);
      return station ? `Back to ${station.label}` : "Back";
    }
    return "Back";
  }

  function goBack() {
    if (selection?.from) select(selection.from);
    else setSelection(null);
  }

  function goFloor(n) {
    setLevel(n);
    setSelection(null);
    flyHome();
  }

  function goLayer(next) {
    setLayer(next);
    setSelection(null);
  }

  function requestKit({ kind, roomId, zoneId }) {
    setIndicated((prev) => {
      if (prev.some((p) => p.kind === kind && (p.roomId || null) === (roomId || null) && p.zoneId === zoneId && p.floor === level)) {
        return prev;
      }
      return prev.concat({
        id: `staff:${level}:${roomId || zoneId}:${kind}:${Date.now()}`,
        kind,
        roomId: roomId || null,
        zoneId,
        floor: level,
      });
    });
  }

  const selectedPatient = selection?.type === "patient"
    ? placementByPatient(occupied, selection.id)
    : null;
  const selectedArea = selection?.type === "zone"
    ? occupied.areas.find((a) => a.id === selection.id)
    : null;
  const selectedRoom = selection?.type === "room"
    ? layout.rooms.find((r) => r.id === selection.id)
    : null;
  const selectedResource = selection?.type === "resource"
    ? layout.stations.find((s) => s.id === selection.id)
    : null;
  const selectedAsset = selection?.type === "asset"
    ? assetById(equipment, selection.id)
    : null;

  const kpis = flow?.kpis;
  const hot = occupied.hot.slice(0, 6);
  const people = occupied.placements.filter((pl) => !pl.companion && !pl.staff).length;
  const counts = equipment?.counts || {};
  const openNeeds = (equipment?.open || []).slice(0, 8);

  return (
    <div className="command-map">
      <HospitalScene
        occupied={occupied}
        selection={selection}
        zoom={zoom}
        ranks={ranks}
        focus={focus}
        onSelect={select}
        onZoom={setZoom}
        layer={layer}
        onReset={flyHome}
      />

      <div className="map-hud map-hud-tl">
        <p className="page-kicker">Yale New Haven Hospital</p>
        <h2 className="map-hud-title">{layout.name}</h2>
        <p className="small muted" style={{ margin: 0 }}>
          {kitLayer
            ? `${counts.tracked || 0} pieces · ${counts.requested || 0} on the way · ${counts.needed || 0} short`
            : `${people} on this floor${kpis ? ` · ${kpis.active} in hospital · ${kpis.waiting} in line` : ""}`}
        </p>
        <div className="map-floors">
          <button type="button" className={level === 1 ? "is-on" : ""} onClick={() => goFloor(1)}>Floor 1</button>
          <button type="button" className={level === 2 ? "is-on" : ""} onClick={() => goFloor(2)}>Floor 2</button>
        </div>
        <div className="map-floors map-layers">
          <button type="button" className={!kitLayer ? "is-on" : ""} onClick={() => goLayer("people")}>People</button>
          <button type="button" className={kitLayer ? "is-on" : ""} onClick={() => goLayer("equipment")}>Equipment</button>
        </div>
        <p className="map-controls-hint">Drag to move · Right-drag to turn · Scroll to zoom · WASD</p>
      </div>

      <div className="map-hud map-hud-tr">
        {kitLayer ? (
          <FindEquipment
            items={equipment?.items || []}
            onPick={(item) => select(sectionForItem(item) || { type: "asset", id: item.id })}
          />
        ) : (
          <FindPerson
            patients={visiblePatients}
            onRefresh={onRefresh}
            variant="bar"
            onPick={(p) => select({ type: "patient", id: p.id })}
          />
        )}
      </div>

      <div className="map-hud map-hud-bl">
        <p className="kicker" style={{ margin: "0 0 6px" }}>Go to</p>
        <div className="map-jumps">
          {jumps.map((area) => (
            <button key={area.id} type="button" onClick={() => select({ type: "zone", id: area.id })}>
              {shortName(area.name)}
            </button>
          ))}
        </div>
        {kitLayer ? (
          openNeeds.length > 0 && (
            <>
              <p className="kicker" style={{ margin: "12px 0 6px" }}>Short for a visit</p>
              <div className="map-hot">
                {openNeeds.map((req) => (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => select({ type: req.roomId ? "room" : "zone", id: req.roomId || req.zoneId })}
                  >
                    <strong>{req.label}</strong>
                    <span>{req.roomLabel} · {req.patientName}</span>
                  </button>
                ))}
              </div>
            </>
          )
        ) : (
          hot.length > 0 && (
            <>
              <p className="kicker" style={{ margin: "12px 0 6px" }}>Needs a look</p>
              <div className="map-hot">
                {hot.map((pl) => (
                  <button key={pl.patient.id} type="button" onClick={() => select({ type: "patient", id: pl.patient.id })}>
                    <strong>{pl.patient.name}</strong>
                    <span>{pl.slot.label}{pl.flags.exception ? " · vitals" : pl.flags.stuck ? " · waiting" : ""}</span>
                  </button>
                ))}
              </div>
            </>
          )
        )}
      </div>

      <div className="map-legend">
        {kitLayer ? (
          <>
            <span><i className="lg quiet" /> Available</span>
            <span><i className="lg use" /> In use</span>
            <span><i className="lg warn" /> On the way</span>
            <span><i className="lg alert" /> Short</span>
          </>
        ) : (
          <>
            <span><i className="lg quiet" /> All right</span>
            <span><i className="lg wait" /> Waiting</span>
            <span><i className="lg warn" /> Held up</span>
            <span><i className="lg alert" /> Check vitals</span>
          </>
        )}
      </div>

      {selectedPatient && (
        <PatientPanel
          placement={selectedPatient}
          floor={floor}
          onRefresh={onRefresh}
          onClose={() => setSelection(null)}
          onBack={selection.from ? goBack : null}
          backLabel={backLabelFor(selection.from)}
        />
      )}
      {selectedArea && (
        <AreaPanel
          area={selectedArea}
          occupied={occupied}
          layer={layer}
          onSelectPatient={(id) => select({ type: "patient", id })}
          onSelectAsset={(id) => select({ type: "asset", id })}
          onRequestKit={requestKit}
          onClose={() => setSelection(null)}
        />
      )}
      {selectedRoom && (
        <RoomPanel
          room={selectedRoom}
          occupied={occupied}
          layer={layer}
          onSelectPatient={(id) => select({ type: "patient", id })}
          onSelectAsset={(id) => select({ type: "asset", id })}
          onRequestKit={requestKit}
          onClose={() => setSelection(null)}
        />
      )}
      {selectedResource && (
        <ResourcePanel
          station={selectedResource}
          occupied={occupied}
          layer={layer}
          onSelectPatient={(id) => select({ type: "patient", id })}
          onSelectAsset={(id) => select({ type: "asset", id })}
          onRequestKit={requestKit}
          onClose={() => setSelection(null)}
        />
      )}
      {selectedAsset && (
        <EquipmentPanel
          item={selectedAsset}
          onClose={() => setSelection(null)}
          onBack={selection.from ? goBack : null}
          backLabel={backLabelFor(selection.from)}
        />
      )}
    </div>
  );
}
