import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { overlayFor } from "./overlays.js";
import { RING } from "./palette.js";
import TrackMark from "./TrackMark.jsx";

const STAFF_CLOTH = {
  nurse: "#1f6b66",
  physician: "#eef4f5",
  tech: "#3d5c68",
  clerk: "#4a5560",
  pharmacist: "#2d5c58",
};

const SKIN = ["#e4c4a6", "#c49a72", "#8a6248", "#f0d4b6", "#5c4034", "#d2a07a"];
const HAIR = ["#1c1816", "#4a3426", "#2a2422", "#6a5440", "#d8cfc4", "#3a3030"];

function hash01(id) {
  let h = 0;
  for (const ch of String(id)) h = (h + ch.charCodeAt(0) * 17) % 1000;
  return h / 1000;
}

function SkinMat({ color }) {
  return <meshStandardMaterial color={color} roughness={0.78} metalness={0} />;
}

function ClothMat({ color }) {
  return <meshStandardMaterial color={color} roughness={0.86} metalness={0.02} />;
}

function Head({ skin, hair, y }) {
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.108, 18, 16]} />
        <SkinMat color={skin} />
      </mesh>
      <mesh position={[0, 0.05, -0.01]} scale={[1.02, 0.58, 1.05]} castShadow>
        <sphereGeometry args={[0.1, 14, 12]} />
        <meshStandardMaterial color={hair} roughness={0.92} />
      </mesh>
      <mesh position={[0, -0.06, 0.09]} scale={[0.55, 0.22, 0.35]}>
        <sphereGeometry args={[0.08, 10, 8]} />
        <SkinMat color={skin} />
      </mesh>
    </group>
  );
}

function StandingFigure({ skin, hair, cloth, staff, coat }) {
  return (
    <group>
      {[[-0.085, 0.22], [0.085, 0.22]].map(([x, y]) => (
        <mesh key={`ll-${x}`} position={[x, y, 0]} castShadow>
          <capsuleGeometry args={[0.052, 0.3, 5, 12]} />
          <ClothMat color={staff ? cloth : "#9aadaa"} />
        </mesh>
      ))}
      {[[-0.085, 0.56], [0.085, 0.56]].map(([x, y]) => (
        <mesh key={`ul-${x}`} position={[x, y, 0]} castShadow>
          <capsuleGeometry args={[0.058, 0.3, 5, 12]} />
          <ClothMat color={staff ? cloth : "#9aadaa"} />
        </mesh>
      ))}
      <mesh position={[0, 0.8, 0]} castShadow>
        <sphereGeometry args={[0.13, 14, 12]} />
        <ClothMat color={cloth} />
      </mesh>
      <mesh position={[0, 1.14, 0.01]} castShadow>
        <capsuleGeometry args={[0.145, 0.42, 6, 14]} />
        <ClothMat color={cloth} />
      </mesh>
      {coat && (
        <mesh position={[0, 1.12, 0.02]}>
          <capsuleGeometry args={[0.16, 0.5, 6, 12]} />
          <meshStandardMaterial color="#f4f8f8" roughness={0.7} transparent opacity={0.92} />
        </mesh>
      )}
      {[[-0.2, 0.12], [0.2, -0.12]].map(([x, roll]) => (
        <mesh key={`arm-${x}`} position={[x, 1.08, 0.02]} rotation={[0.12, 0, roll]} castShadow>
          <capsuleGeometry args={[0.04, 0.46, 5, 10]} />
          <ClothMat color={coat ? "#f4f8f8" : cloth} />
        </mesh>
      ))}
      <mesh position={[-0.2, 0.82, 0.06]} castShadow>
        <sphereGeometry args={[0.038, 10, 10]} />
        <SkinMat color={skin} />
      </mesh>
      <mesh position={[0.2, 0.82, 0.06]} castShadow>
        <sphereGeometry args={[0.038, 10, 10]} />
        <SkinMat color={skin} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <capsuleGeometry args={[0.038, 0.05, 4, 8]} />
        <SkinMat color={skin} />
      </mesh>
      <Head skin={skin} hair={hair} y={1.54} />
    </group>
  );
}

function SeatedFigure({ skin, hair, cloth, coat }) {
  return (
    <group>
      <mesh position={[0, 0.46, 0]} castShadow>
        <sphereGeometry args={[0.13, 14, 12]} />
        <ClothMat color={cloth} />
      </mesh>
      {[[-0.08, 0.48, 0.2], [0.08, 0.48, 0.2]].map(([x, y, z]) => (
        <mesh key={`th-${x}`} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.28, 5, 10]} />
          <ClothMat color={cloth} />
        </mesh>
      ))}
      {[[-0.08, 0.24, 0.38], [0.08, 0.24, 0.38]].map(([x, y, z]) => (
        <mesh key={`cv-${x}`} position={[x, y, z]} castShadow>
          <capsuleGeometry args={[0.05, 0.26, 5, 10]} />
          <ClothMat color="#d5dad6" />
        </mesh>
      ))}
      <mesh position={[0, 0.82, 0.02]} castShadow>
        <capsuleGeometry args={[0.14, 0.36, 6, 14]} />
        <ClothMat color={cloth} />
      </mesh>
      {coat && (
        <mesh position={[0, 0.8, 0.03]}>
          <capsuleGeometry args={[0.155, 0.42, 6, 12]} />
          <meshStandardMaterial color="#f4f8f8" roughness={0.7} transparent opacity={0.92} />
        </mesh>
      )}
      {[[-0.18, 0.1], [0.18, -0.1]].map(([x, roll]) => (
        <mesh key={`arm-${x}`} position={[x, 0.72, 0.1]} rotation={[0.85, 0, roll]} castShadow>
          <capsuleGeometry args={[0.038, 0.32, 5, 10]} />
          <ClothMat color={coat ? "#f4f8f8" : cloth} />
        </mesh>
      ))}
      <mesh position={[0, 1.06, 0.02]}>
        <capsuleGeometry args={[0.036, 0.04, 4, 8]} />
        <SkinMat color={skin} />
      </mesh>
      <Head skin={skin} hair={hair} y={1.2} />
    </group>
  );
}

function RecumbentFigure({ skin, hair, cloth }) {
  return (
    <group position={[0, 0.62, 0.06]}>
      <mesh position={[0, 0, -0.82]} castShadow>
        <sphereGeometry args={[0.108, 16, 14]} />
        <SkinMat color={skin} />
      </mesh>
      <mesh position={[0, 0.04, -0.86]} scale={[1, 0.5, 0.9]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color={hair} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.02, -0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.19, 0.7, 6, 14]} />
        <ClothMat color={cloth} />
      </mesh>
      <mesh position={[0, 0.1, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.12, 0.4, 4, 10]} />
        <meshStandardMaterial color="#e4eeed" roughness={0.9} />
      </mesh>
      {[[-0.16, 0.12], [0.16, -0.12]].map(([x]) => (
        <mesh key={`arm-${x}`} position={[x, 0.04, -0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.038, 0.42, 4, 8]} />
          <SkinMat color={skin} />
        </mesh>
      ))}
      {[[-0.07, 0.55], [0.07, 0.55]].map(([x, z]) => (
        <mesh key={`leg-${x}`} position={[x, 0.01, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.42, 4, 10]} />
          <ClothMat color="#dfe6e4" />
        </mesh>
      ))}
    </group>
  );
}

function Figure({ pose, skin, hair, cloth, staff, coat }) {
  if (pose === "recumbent") return <RecumbentFigure skin={skin} hair={hair} cloth={cloth} />;
  if (pose === "seated") return <SeatedFigure skin={skin} hair={hair} cloth={cloth} coat={coat} />;
  return <StandingFigure skin={skin} hair={hair} cloth={cloth} staff={staff} coat={coat} />;
}

export default function PatientEntity({
  placement,
  selected,
  zoom,
  rank,
  path,
  onSelect,
}) {
  const group = useRef();
  const overlay = useMemo(
    () => overlayFor(placement, { selected, zoom, rank }),
    [placement, selected, zoom, rank],
  );
  const seed = useMemo(() => hash01(placement.patient.id), [placement.patient.id]);
  const lastFix = useRef(-1);
  const ping = useRef(1);

  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    const inTransit = placement.pose === "walking" && path?.length;
    let x = placement.slot.x;
    let z = placement.slot.z;
    if (inTransit) {
      const period = 7.4;
      const idx = Math.floor((clock.elapsedTime + seed * 47) / period) % path.length;
      x = path[idx].x;
      z = path[idx].z;
      if (idx !== lastFix.current) {
        lastFix.current = idx;
        ping.current = 0;
      }
    } else {
      const beat = Math.floor((clock.elapsedTime + seed * 83) / 12.5);
      if (beat !== lastFix.current) {
        lastFix.current = beat;
        ping.current = 0;
      }
    }
    group.current.position.x = x;
    group.current.position.z = z;
    ping.current = Math.min(1, ping.current + dt * 1.35);
  });

  const tone = overlay.tone;
  const ring = RING[tone] || RING.quiet;
  const isStaff = Boolean(placement.staff);
  const watching = Boolean(placement.vitals?.watching);
  const showHtml = !isStaff && (overlay.mode !== "dot" || selected || watching);
  const cloth = isStaff
    ? STAFF_CLOTH[placement.patient.role] || STAFF_CLOTH.nurse
    : placement.companion
      ? "#5a6c74"
      : tone === "alert"
        ? "#8a6a6c"
        : "#6a8f8c";
  const skin = SKIN[Math.floor(seed * SKIN.length) % SKIN.length];
  const hair = HAIR[Math.floor(seed * 17) % HAIR.length];
  const coat = isStaff && placement.patient.role === "physician";
  const pose = placement.pose === "walking" ? "standing" : placement.pose;

  return (
    <group
      ref={group}
      position={[placement.slot.x, 0, placement.slot.z]}
      rotation={[0, placement.slot.rot || 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.({ type: "patient", id: placement.patient.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <TrackMark color={isStaff ? "#5aa8a4" : ring} selected={selected} pingRef={ping} />
      <Figure
        pose={pose}
        skin={skin}
        hair={hair}
        cloth={cloth}
        staff={isStaff}
        coat={coat}
      />
      {showHtml && (
        <Html
          position={[0, pose === "recumbent" ? 1.05 : pose === "seated" ? 1.42 : 1.78, 0]}
          center
          distanceFactor={13}
          zIndexRange={[3, 0]}
          style={{ pointerEvents: selected ? "auto" : "none" }}
        >
          <button
            type="button"
            className={`map-overlay ${tone} is-${overlay.mode} ${selected ? "is-selected" : ""} ${watching ? "is-watching" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.({ type: "patient", id: placement.patient.id });
            }}
          >
            <strong>{overlay.name}</strong>
            {overlay.vitals && (
              <span className={`map-overlay-vitals ${overlay.vitals.exception ? "is-alert" : ""}`}>
                {overlay.vitals.text}
              </span>
            )}
            {overlay.lines.filter((line) => line !== overlay.vitals?.text).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </button>
        </Html>
      )}
    </group>
  );
}
