import { Html } from "@react-three/drei";

function visitLine(section) {
  if (!section.visits.length) return "";
  const first = section.visits[0];
  if (section.visits.length === 1) return `${first.headline} · ${first.name}`;
  return `${section.visits.length} visits · ${first.headline}`;
}

function kitLine(section) {
  if (section.needs.length) {
    const names = [...new Set(section.needs.map((n) => n.label))];
    if (names.length <= 3) return `Need ${names.join(", ")}`;
    return `Need ${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }
  const names = section.supplies.slice(0, 4).map((s) => (
    s.count > 1 ? `${s.label} ×${s.count}` : s.label
  ));
  if (!names.length) return `${section.counts.here} here`;
  return names.join(" · ");
}

export default function RoomKitOverlay({ section, selected, zoom, onSelect }) {
  const quietFar = zoom === "far" && section.tone === "quiet" && !section.needs.length && !section.visits.length;
  if (quietFar && !selected) return null;

  const compact = zoom === "far" && section.tone === "quiet";
  const work = visitLine(section);
  const kit = kitLine(section);

  return (
    <Html
      position={[section.x, 1.82, section.z]}
      center
      distanceFactor={compact ? 18 : 15}
      zIndexRange={[5, 0]}
      wrapperClass="map-html"
      style={{ pointerEvents: "none" }}
    >
      <button
        type="button"
        className={`map-overlay is-section ${section.tone} ${selected ? "is-selected" : ""} ${section.needs.length ? "is-ghost" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.({ type: section.type, id: section.id });
        }}
      >
        <strong>{section.title}</strong>
        {!compact && work && <span>{work}</span>}
        <span className="map-overlay-kit">{kit}</span>
      </button>
    </Html>
  );
}
