import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box, CrashCart } from "./Furniture.jsx";
import { RING } from "./palette.js";
import TrackMark from "./TrackMark.jsx";
import { sectionForItem } from "./equipment.js";

const STATUS_TONE = {
  available: "quiet",
  "in-use": "accent",
  requested: "warn",
  needed: "alert",
};

function Chassis({ w = 0.4, d = 0.36, opacity = 1, children }) {
  return (
    <group>
      <Box position={[0, 0.07, 0]} args={[w, 0.05, d]} color="#2c3436" opacity={opacity} roughness={0.4} metalness={0.2} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}-${sz}`} position={[sx * (w / 2 - 0.05), 0.045, sz * (d / 2 - 0.05)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.035, 10]} />
          <meshStandardMaterial color="#1b2122" transparent={opacity < 1} opacity={opacity} />
        </mesh>
      ))}
      {children}
    </group>
  );
}

function Screen({ y, w = 0.32, h = 0.24, lit, opacity = 1 }) {
  return (
    <group position={[0, y, 0.02]}>
      <Box args={[w, h, 0.04]} color="#d7e0e2" opacity={opacity} roughness={0.28} metalness={0.18} />
      <Box
        position={[0, 0, 0.024]}
        args={[w - 0.06, h - 0.06, 0.01]}
        color="#152022"
        emissive={lit ? "#6ed4cc" : "#1a3032"}
        emissiveIntensity={lit ? 0.28 : 0.04}
        opacity={opacity}
      />
    </group>
  );
}

function KitMesh({ kind, status, opacity }) {
  const lit = status === "in-use" || status === "requested";
  if (kind === "monitor") {
    return (
      <group>
        <Box position={[0, 0.55, 0]} args={[0.06, 1.05, 0.06]} color="#4a585c" opacity={opacity} />
        <Screen y={1.18} lit={lit} opacity={opacity} />
      </group>
    );
  }
  if (kind === "iv-pump") {
    return (
      <group>
        <Box position={[0, 0.7, 0]} args={[0.05, 1.35, 0.05]} color="#c5cecf" opacity={opacity} metalness={0.35} />
        <Box position={[0.08, 0.85, 0]} args={[0.16, 0.28, 0.12]} color="#3d6a6e" opacity={opacity} />
        <Box position={[0.08, 1.12, 0]} args={[0.14, 0.16, 0.1]} color="#dfe6e6" opacity={opacity} />
      </group>
    );
  }
  if (kind === "suction") {
    return (
      <group>
        <Box position={[0, 0.42, 0]} args={[0.22, 0.55, 0.22]} color="#3c5458" opacity={opacity} />
        <mesh position={[0, 0.82, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.22, 12]} />
          <meshStandardMaterial color="#8aa0a4" transparent={opacity < 1} opacity={opacity} />
        </mesh>
      </group>
    );
  }
  if (kind === "crash-cart") {
    return <CrashCart position={[0, 0, 0]} />;
  }
  if (kind === "ultrasound") {
    return (
      <Chassis opacity={opacity}>
        <Box position={[0, 0.55, 0]} args={[0.42, 0.7, 0.36]} color="#3f5358" opacity={opacity} />
        <Screen y={1.05} w={0.3} h={0.22} lit={lit} opacity={opacity} />
        <Box position={[0.22, 0.62, 0.02]} args={[0.08, 0.28, 0.06]} color="#c5d0d2" opacity={opacity} />
      </Chassis>
    );
  }
  if (kind === "portable-xray") {
    return (
      <Chassis w={0.48} d={0.42} opacity={opacity}>
        <Box position={[0, 0.55, 0]} args={[0.34, 0.7, 0.28]} color="#4b5c60" opacity={opacity} />
        <mesh position={[0.28, 1.05, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.28, 0.045, 8, 18, Math.PI]} />
          <meshStandardMaterial color="#c5ced0" metalness={0.4} roughness={0.3} transparent={opacity < 1} opacity={opacity} />
        </mesh>
      </Chassis>
    );
  }
  if (kind === "ecg") {
    return (
      <Chassis w={0.44} d={0.32} opacity={opacity}>
        <Box position={[0, 0.42, 0]} args={[0.4, 0.42, 0.28]} color="#35575c" opacity={opacity} />
        <Screen y={0.78} w={0.34} h={0.2} lit={lit} opacity={opacity} />
      </Chassis>
    );
  }
  if (kind === "nebulizer") {
    return (
      <group>
        <Box position={[0, 0.22, 0]} args={[0.22, 0.28, 0.22]} color="#3d6a72" opacity={opacity} />
        <mesh position={[0, 0.44, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.16, 10]} />
          <meshStandardMaterial color="#d5e0e2" transparent={opacity < 1} opacity={opacity} />
        </mesh>
      </group>
    );
  }
  if (kind === "suture-tray") {
    return (
      <group>
        <Box position={[0, 0.72, 0]} args={[0.08, 1.2, 0.08]} color="#8a9698" opacity={opacity} metalness={0.3} />
        <Box position={[0, 1.34, 0]} args={[0.42, 0.04, 0.3]} color="#dfe6e6" opacity={opacity} />
        <Box position={[0, 1.38, 0]} args={[0.36, 0.03, 0.24]} color="#b7c4b8" opacity={opacity} />
      </group>
    );
  }
  if (kind === "ventilator" || kind === "airway-cart") {
    return (
      <Chassis w={0.4} d={0.34} opacity={opacity}>
        <Box position={[0, 0.7, 0]} args={[0.38, 1.05, 0.32]} color={kind === "ventilator" ? "#2f4d52" : "#355a62"} opacity={opacity} />
        <Screen y={1.12} w={0.28} h={0.18} lit={lit} opacity={opacity} />
      </Chassis>
    );
  }
  if (kind === "phlebotomy") {
    return (
      <Chassis w={0.38} d={0.3} opacity={opacity}>
        <Box position={[0, 0.48, 0]} args={[0.36, 0.55, 0.28]} color="#406058" opacity={opacity} />
        <Box position={[0, 0.78, 0]} args={[0.32, 0.04, 0.24]} color="#d7e0dc" opacity={opacity} />
      </Chassis>
    );
  }
  if (kind === "telemetry") {
    return (
      <group>
        <Box position={[0, 0.18, 0]} args={[0.2, 0.12, 0.12]} color="#2f4a4e" opacity={opacity} />
        <Box
          position={[0, 0.18, 0.07]}
          args={[0.08, 0.04, 0.02]}
          color="#6ed4cc"
          emissive="#6ed4cc"
          emissiveIntensity={lit ? 0.4 : 0.12}
          opacity={opacity}
        />
      </group>
    );
  }
  if (kind === "fetal-monitor") {
    return (
      <Chassis opacity={opacity}>
        <Box position={[0, 0.5, 0]} args={[0.4, 0.62, 0.32]} color="#3a5854" opacity={opacity} />
        <Screen y={0.95} lit={lit} opacity={opacity} />
      </Chassis>
    );
  }
  if (kind === "slit-lamp") {
    return (
      <group>
        <Box position={[0, 0.55, 0]} args={[0.7, 0.06, 0.42]} color="#d5dcde" opacity={opacity} />
        <Box position={[0, 0.28, 0]} args={[0.5, 0.5, 0.32]} color="#3d4c50" opacity={opacity} />
        <mesh position={[0, 0.82, 0.04]} rotation={[0.4, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.36, 10]} />
          <meshStandardMaterial color="#9aa6a8" transparent={opacity < 1} opacity={opacity} />
        </mesh>
      </group>
    );
  }
  if (kind === "pft-rig") {
    return (
      <Chassis w={0.42} d={0.34} opacity={opacity}>
        <Box position={[0, 0.55, 0]} args={[0.38, 0.7, 0.3]} color="#35585c" opacity={opacity} />
        <mesh position={[0.18, 0.95, 0]}>
          <cylinderGeometry args={[0.04, 0.05, 0.28, 10]} />
          <meshStandardMaterial color="#c5d0d2" transparent={opacity < 1} opacity={opacity} />
        </mesh>
      </Chassis>
    );
  }
  if (kind === "stretcher") {
    return (
      <group>
        <Box position={[0, 0.42, 0]} args={[0.62, 0.08, 1.35]} color="#dfe6e6" opacity={opacity} />
        <Box position={[0, 0.22, 0]} args={[0.5, 0.28, 1.2]} color="#3d4c50" opacity={opacity} />
      </group>
    );
  }
  if (kind === "wheelchair") {
    return (
      <group>
        <Box position={[0, 0.38, 0]} args={[0.42, 0.08, 0.38]} color="#4a5c61" opacity={opacity} />
        <Box position={[0, 0.58, -0.16]} args={[0.42, 0.36, 0.06]} color="#3d4c50" opacity={opacity} />
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.22, 0.02]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.16, 0.025, 8, 16]} />
            <meshStandardMaterial color="#1c2426" transparent={opacity < 1} opacity={opacity} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <Box position={[0, 0.35, 0]} args={[0.32, 0.5, 0.28]} color="#3d5558" opacity={opacity} />
  );
}

export default function EquipmentEntity({ item, selected, onSelect }) {
  const group = useRef();
  const ping = useRef(1);
  const lastFix = useRef(-1);
  const seed = useMemo(() => (hash01(item.id)), [item.id]);
  const tone = STATUS_TONE[item.status] || "quiet";
  const ring = RING[tone] || RING.quiet;
  const period = item.status === "available" ? 12.8 : item.status === "needed" ? 5.6 : 7.2;
  const hideMesh = item.kind === "ct" || item.kind === "mri";
  const opacity = item.ghost ? 0.38 : 1;

  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    const beat = Math.floor((clock.elapsedTime + seed * 91) / period);
    if (beat !== lastFix.current) {
      lastFix.current = beat;
      ping.current = 0;
    }
    ping.current = Math.min(1, ping.current + dt * 1.4);
    group.current.position.x = item.x;
    group.current.position.z = item.z;
  });

  function pick(e) {
    e.stopPropagation();
    const section = sectionForItem(item);
    onSelect?.(section || { type: "asset", id: item.id });
  }

  return (
    <group
      ref={group}
      position={[item.x, 0, item.z]}
      onClick={pick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <TrackMark color={ring} selected={selected} pingRef={ping} scale={item.ghost ? 0.85 : 0.92} />
      {!hideMesh && <KitMesh kind={item.kind} status={item.status} opacity={opacity} />}
    </group>
  );
}

function hash01(id) {
  let h = 0;
  for (const ch of String(id)) h = (h + ch.charCodeAt(0) * 17) % 1000;
  return h / 1000;
}
