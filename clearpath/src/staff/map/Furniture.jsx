import { Text } from "@react-three/drei";
import { PALETTE } from "./palette.js";

export function Box({
  position,
  args,
  color,
  opacity = 1,
  roughness = 0.82,
  metalness = 0.04,
  emissive,
  emissiveIntensity = 0,
  receiveShadow,
  castShadow,
  rotation,
  onClick,
  onPointerOver,
  onPointerOut,
}) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={emissive || "#000"}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

export function Seat({ slot }) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot || 0, 0]}>
      <Box position={[0, 0.32, 0]} args={[0.56, 0.08, 0.54]} color={PALETTE.seat} castShadow receiveShadow />
      <Box position={[0, 0.18, 0]} args={[0.5, 0.2, 0.48]} color={PALETTE.seatBack} />
      {[[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]].map(([x, z]) => (
        <Box key={`${x}-${z}`} position={[x, 0.1, z]} args={[0.055, 0.2, 0.055]} color={PALETTE.seatBack} />
      ))}
      <Box position={[0, 0.58, -0.23]} args={[0.56, 0.48, 0.08]} color={PALETTE.seatBack} castShadow />
      <Box position={[-0.29, 0.4, 0.02]} args={[0.05, 0.12, 0.4]} color={PALETTE.seatBack} />
      <Box position={[0.29, 0.4, 0.02]} args={[0.05, 0.12, 0.4]} color={PALETTE.seatBack} />
    </group>
  );
}

export function Bed({ slot }) {
  return (
    <group position={[slot.x, 0, slot.z]}>
      {[[-0.46, -0.9], [0.46, -0.9], [-0.46, 0.9], [0.46, 0.9]].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.08, z]}>
          <cylinderGeometry args={[0.06, 0.06, 0.12, 10]} />
          <meshStandardMaterial color="#3a4447" metalness={0.35} roughness={0.4} />
        </mesh>
      ))}
      <Box position={[0, 0.22, 0]} args={[1.14, 0.16, 2.22]} color={PALETTE.frame} roughness={0.38} metalness={0.28} castShadow receiveShadow />
      <Box position={[0, 0.4, 0]} args={[1.04, 0.18, 2.1]} color={PALETTE.mattress} roughness={0.9} receiveShadow />
      <Box position={[0, 0.52, 0.08]} args={[0.94, 0.07, 1.58]} color="#e4eeed" roughness={0.92} />
      <Box position={[0, 0.58, -0.84]} args={[0.72, 0.16, 0.42]} color={PALETTE.linen} />
      <Box position={[0.16, 0.62, -0.78]} args={[0.28, 0.08, 0.22]} color="#dfe8e6" />
      <Box position={[0, 0.5, 0.92]} args={[0.9, 0.1, 0.32]} color="#d4e0de" />
      <Box position={[0, 0.47, 0.55]} args={[0.88, 0.04, 0.5]} color="#c5d4d0" roughness={0.88} />
      <Box position={[-0.54, 0.62, 0]} args={[0.04, 0.42, 1.7]} color="#c5d0d4" roughness={0.3} metalness={0.2} />
      <Box position={[0.54, 0.62, 0]} args={[0.04, 0.42, 1.7]} color="#c5d0d4" roughness={0.3} metalness={0.2} />
      <Box position={[-0.54, 0.84, 0.35]} args={[0.05, 0.08, 0.7]} color="#b7c4c8" metalness={0.25} />
      <Box position={[0.54, 0.84, 0.35]} args={[0.05, 0.08, 0.7]} color="#b7c4c8" metalness={0.25} />
      <Box position={[0, 0.68, 1.08]} args={[1.14, 0.72, 0.07]} color={PALETTE.frame} roughness={0.45} />
      <Box position={[0, 0.22, 1.08]} args={[1.14, 0.2, 0.08]} color="#2f3c40" />
      <Box position={[0.62, 0.96, 0.58]} args={[0.05, 1.12, 0.46]} color="#b7c4c8" roughness={0.22} metalness={0.22} />
      <Box position={[0.62, 1.38, 0.58]} args={[0.04, 0.32, 0.4]} color="#dce8ea" roughness={0.12} metalness={0.18} emissive="#cfe4e8" emissiveIntensity={0.22} />
      <Box position={[0.62, 1.18, 0.58]} args={[0.02, 0.04, 0.28]} color="#6ed4cc" emissive="#6ed4cc" emissiveIntensity={0.35} />
      <Box position={[0.54, 0.58, -0.2]} args={[0.46, 0.04, 0.72]} color="#d4cec2" roughness={0.55} />
      <Box position={[0.54, 0.36, -0.2]} args={[0.08, 0.4, 0.08]} color="#8b9699" metalness={0.4} roughness={0.3} />
      <mesh position={[-0.66, 0.9, 0.42]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 1.62, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.5} roughness={0.28} />
      </mesh>
      <mesh position={[-0.66, 1.7, 0.42]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, 0.3, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.5} roughness={0.28} />
      </mesh>
      <mesh position={[-0.66, 1.64, 0.28]}>
        <sphereGeometry args={[0.042, 8, 8]} />
        <meshStandardMaterial color="#c45c4a" roughness={0.4} />
      </mesh>
      <Box position={[-0.72, 0.42, -0.55]} args={[0.32, 0.46, 0.32]} color="#efe8dc" />
      <Box position={[-0.72, 0.66, -0.55]} args={[0.28, 0.04, 0.28]} color="#d7cfc2" />
      <Box position={[-0.72, 0.72, -0.5]} args={[0.12, 0.08, 0.1]} color="#c45c4a" />
    </group>
  );
}

export function Stretcher({ slot }) {
  return (
    <group position={[slot.x, 0, slot.z]}>
      <Box position={[0, 0.46, 0]} args={[0.84, 0.1, 1.96]} color={PALETTE.mattress} castShadow />
      <Box position={[0, 0.52, 0.12]} args={[0.74, 0.04, 1.4]} color="#e8f0ea" />
      <Box position={[0, 0.36, 0]} args={[0.8, 0.08, 1.9]} color={PALETTE.frame} metalness={0.28} roughness={0.38} />
      {[[-0.3, 0.78], [0.3, 0.78], [-0.3, -0.78], [0.3, -0.78]].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.18, z]}>
          <cylinderGeometry args={[0.05, 0.05, 0.32, 8]} />
          <meshStandardMaterial color="#4e595c" metalness={0.32} roughness={0.4} />
        </mesh>
      ))}
      <Box position={[0, 0.62, 0.92]} args={[0.84, 0.28, 0.05]} color={PALETTE.frame} />
      <Box position={[-0.4, 0.62, 0]} args={[0.03, 0.22, 1.5]} color="#c5d0d4" />
      <Box position={[0.4, 0.62, 0]} args={[0.03, 0.22, 1.5]} color="#c5d0d4" />
      <mesh position={[0.46, 0.85, -0.5]}>
        <cylinderGeometry args={[0.018, 0.018, 1.1, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.45} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function Curtain({ room }) {
  const folds = [-0.55, -0.28, 0, 0.28, 0.55];
  return (
    <group>
      <Box position={[room.x, 2.08, room.z + 0.12]} args={[0.05, 0.05, room.d - 1.05]} color="#8b9699" metalness={0.4} roughness={0.3} />
      <Box position={[room.x, 2.08, room.z - room.d / 2 + 0.7]} args={[0.08, 0.12, 0.08]} color="#6a787c" />
      {folds.map((x, i) => (
        <Box
          key={x}
          position={[room.x + x * 0.08, 1.12, room.z + 0.12]}
          args={[0.045, 1.86, room.d - 1.25]}
          color={i % 2 ? "#d8e2e4" : "#cdd8db"}
          opacity={0.62}
          roughness={0.95}
        />
      ))}
    </group>
  );
}

export function Door({ room }) {
  const z = room.z - room.d / 2;
  return (
    <group>
      <Box position={[room.x - 0.72, 0.82, z]} args={[0.12, 1.64, 0.18]} color="#d8e0e2" />
      <Box position={[room.x + 0.72, 0.82, z]} args={[0.12, 1.64, 0.18]} color="#d8e0e2" />
      <Box position={[room.x, 1.62, z]} args={[1.56, 0.1, 0.18]} color="#d8e0e2" />
      <Box position={[room.x - 0.72, 0.06, z]} args={[0.16, 0.12, 0.22]} color="#c5cecf" />
      <Box position={[room.x + 0.72, 0.06, z]} args={[0.16, 0.12, 0.22]} color="#c5cecf" />
      <Box
        position={[room.x + 0.48, 0.76, z + 0.38]}
        rotation={[0, -0.72, 0]}
        args={[0.9, 1.48, 0.05]}
        color="#c5d2d6"
        roughness={0.52}
        metalness={0.12}
        castShadow
      />
      <Box
        position={[room.x + 0.38, 1.22, z + 0.42]}
        rotation={[0, -0.72, 0]}
        args={[0.28, 0.38, 0.02]}
        color={PALETTE.glass}
        opacity={0.45}
        roughness={0.08}
      />
      <Box position={[room.x + 0.12, 0.74, z + 0.72]} args={[0.04, 0.08, 0.04]} color="#8a7a62" metalness={0.4} />
      <Box position={[room.x + 0.48, 0.18, z + 0.38]} rotation={[0, -0.72, 0]} args={[0.9, 0.28, 0.06]} color="#b7c2c4" />
      <Box position={[room.x - 0.92, 1.05, z + 0.08]} args={[0.06, 0.12, 0.04]} color="#2a3c40" />
      <Box position={[room.x - 0.92, 1.05, z + 0.11]} args={[0.03, 0.05, 0.02]} color={PALETTE.led} emissive={PALETTE.led} emissiveIntensity={0.4} />
    </group>
  );
}

export function Headwall({ room }) {
  const z = room.z + room.d / 2 - 0.1;
  const outlets = [-1.35, -0.45, 0.45, 1.35].filter((x) => Math.abs(x) < room.w / 2 - 0.55);
  return (
    <group>
      <Box position={[room.x, 1.18, z]} args={[Math.max(1.8, room.w - 0.5), 0.82, 0.1]} color="#e4eaea" roughness={0.42} />
      <Box position={[room.x, 0.72, z]} args={[Math.max(1.8, room.w - 0.5), 0.08, 0.12]} color="#c5d0d2" metalness={0.2} />
      {outlets.map((x) => (
        <group key={x} position={[room.x + x, 1.32, z + 0.03]}>
          <Box position={[0, 0.08, 0]} args={[0.28, 0.22, 0.04]} color="#dfe6e6" />
          <Box position={[-0.08, 0.1, 0.02]} args={[0.06, 0.06, 0.03]} color="#c45c4a" />
          <Box position={[0.02, 0.1, 0.02]} args={[0.06, 0.06, 0.03]} color="#3d7a9a" />
          <Box position={[0.12, 0.1, 0.02]} args={[0.06, 0.06, 0.03]} color="#d7c56a" />
        </group>
      ))}
      {outlets.slice(0, 2).map((x) => (
        <mesh key={`vac-${x}`} position={[room.x + x, 0.92, z + 0.08]}>
          <cylinderGeometry args={[0.045, 0.05, 0.16, 10]} />
          <meshStandardMaterial color="#9aa8ac" metalness={0.35} roughness={0.32} />
        </mesh>
      ))}
      <Box position={[room.x + Math.min(room.w / 2 - 0.4, 1.9), 1.48, z + 0.04]} args={[0.16, 0.1, 0.04]} color="#2a3c40" />
      <Box position={[room.x + Math.min(room.w / 2 - 0.4, 1.9), 1.48, z + 0.06]} args={[0.08, 0.04, 0.02]} color="#c45c4a" emissive="#c45c4a" emissiveIntensity={0.25} />
    </group>
  );
}

export function Cabinet({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.7, 0]} args={[0.52, 1.4, 0.42]} color="#dfe4e2" roughness={0.55} castShadow />
      <Box position={[0, 0.7, 0.2]} args={[0.46, 1.28, 0.02]} color="#cfd6d4" />
      <Box position={[0, 0.28, 0.21]} args={[0.42, 0.02, 0.02]} color="#b7c0be" />
      <Box position={[0, 0.72, 0.21]} args={[0.42, 0.02, 0.02]} color="#b7c0be" />
      <Box position={[0.16, 0.92, 0.22]} args={[0.04, 0.1, 0.02]} color="#8b9699" />
      <Box position={[0.16, 0.48, 0.22]} args={[0.04, 0.1, 0.02]} color="#8b9699" />
    </group>
  );
}

export function HandSink({ position, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Box position={[0, 0.78, 0]} args={[0.62, 0.08, 0.42]} color="#dfe4e4" roughness={0.35} />
      <Box position={[0, 0.4, 0]} args={[0.58, 0.7, 0.38]} color="#d5dcdc" />
      <Box position={[0, 0.8, 0]} args={[0.42, 0.06, 0.26]} color="#c5d0d2" />
      <mesh position={[0, 0.96, -0.12]}>
        <cylinderGeometry args={[0.018, 0.018, 0.22, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.45} roughness={0.28} />
      </mesh>
      <Box position={[0, 1.08, -0.04]} args={[0.12, 0.04, 0.16]} color="#8b9699" metalness={0.4} />
      <Box position={[0.28, 1.22, -0.05]} args={[0.16, 0.28, 0.08]} color="#eef4f4" />
    </group>
  );
}

export function GloveDispenser({ position, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Box position={[0, 0, 0]} args={[0.28, 0.22, 0.1]} color="#dfe8e6" />
      <Box position={[-0.07, 0, 0.04]} args={[0.08, 0.16, 0.04]} color="#c5d4c8" />
      <Box position={[0.07, 0, 0.04]} args={[0.08, 0.16, 0.04]} color="#d4c8b4" />
    </group>
  );
}

export function SharpsBox({ position, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Box position={[0, 0, 0]} args={[0.16, 0.22, 0.12]} color="#c45c28" roughness={0.55} />
      <Box position={[0, 0.12, 0.02]} args={[0.12, 0.04, 0.08]} color="#2a3234" />
    </group>
  );
}

export function WasteBin({ position, bio }) {
  return (
    <group position={position}>
      <Box position={[0, 0.22, 0]} args={[0.24, 0.42, 0.24]} color={bio ? "#c45c28" : "#4a585c"} roughness={0.6} />
      <Box position={[0, 0.44, 0]} args={[0.26, 0.04, 0.26]} color={bio ? "#9a4a22" : "#3d4c50"} />
    </group>
  );
}

export function OverbedTable({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.92, 0]} args={[0.58, 0.04, 0.38]} color="#dfe4e4" roughness={0.35} metalness={0.12} />
      <mesh position={[-0.2, 0.48, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.88, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.4} roughness={0.3} />
      </mesh>
      <Box position={[-0.2, 0.06, 0]} args={[0.28, 0.04, 0.28]} color="#3d4c50" />
    </group>
  );
}

export function ExamLight({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.15, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.5, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh position={[0.18, 1.88, 0.12]} rotation={[0.4, 0, 0.3]}>
        <cylinderGeometry args={[0.02, 0.02, 0.42, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh position={[0.32, 1.68, 0.22]}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshStandardMaterial color="#dfe8ea" emissive="#f2f7f7" emissiveIntensity={0.35} roughness={0.25} />
      </mesh>
    </group>
  );
}

export function Whiteboard({ position, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Box position={[0, 0, 0]} args={[0.85, 0.55, 0.04]} color="#d8e0e0" />
      <Box position={[0, 0, 0.015]} args={[0.76, 0.46, 0.02]} color="#f4f8f8" />
      <Box position={[0, -0.24, 0.02]} args={[0.72, 0.04, 0.02]} color="#c5d0d2" />
    </group>
  );
}

export function RoomCove({ room }) {
  const y = 0.08;
  const t = 0.07;
  const x0 = room.x;
  const z0 = room.z;
  return (
    <group>
      <Box position={[x0, y, z0 + room.d / 2 - t / 2]} args={[room.w - 0.08, 0.14, t]} color="#dce4e6" />
      <Box position={[x0, y, z0 - room.d / 2 + t / 2]} args={[room.w - 0.08, 0.14, t]} color="#dce4e6" />
      <Box position={[x0 - room.w / 2 + t / 2, y, z0]} args={[t, 0.14, room.d - 0.08]} color="#dce4e6" />
      <Box position={[x0 + room.w / 2 - t / 2, y, z0]} args={[t, 0.14, room.d - 0.08]} color="#dce4e6" />
    </group>
  );
}

export function RoomSoffit({ room }) {
  const y = 2.42;
  const t = 0.18;
  return (
    <group>
      <Box position={[room.x, y, room.z + room.d / 2 - t / 2]} args={[room.w, 0.1, t]} color="#eef4f5" />
      <Box position={[room.x, y, room.z - room.d / 2 + t / 2]} args={[room.w, 0.1, t]} color="#eef4f5" />
      <Box position={[room.x - room.w / 2 + t / 2, y, room.z]} args={[t, 0.1, room.d]} color="#eef4f5" />
      <Box position={[room.x + room.w / 2 - t / 2, y, room.z]} args={[t, 0.1, room.d]} color="#eef4f5" />
      <Box
        position={[room.x, y + 0.04, room.z]}
        args={[Math.min(2.2, room.w - 0.8), 0.04, 0.42]}
        color="#f4fafa"
        emissive="#e8f4f4"
        emissiveIntensity={0.45}
      />
    </group>
  );
}

export function ExamStool({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.06, 12]} />
        <meshStandardMaterial color="#4a5c61" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.35} roughness={0.35} />
      </mesh>
      <Box position={[0, 0.04, 0]} args={[0.28, 0.04, 0.28]} color="#3d4c50" />
    </group>
  );
}

export function SideTable({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.52, 0]} args={[0.42, 0.06, 0.42]} color="#dfe4e2" />
      <Box position={[0, 0.26, 0]} args={[0.38, 0.46, 0.38]} color="#d5dcdc" />
    </group>
  );
}

export function ExamCouch({ slot }) {
  return (
    <group position={[slot.x, 0, slot.z]}>
      <Box position={[0, 0.28, 0.08]} args={[0.7, 0.4, 1.62]} color="#c5d0d2" roughness={0.5} />
      <Box position={[0, 0.5, 0.12]} args={[0.68, 0.1, 1.55]} color={PALETTE.mattress} roughness={0.9} castShadow />
      <Box position={[0, 0.76, -0.7]} args={[0.68, 0.42, 0.22]} color={PALETTE.mattress} />
      <Box position={[0, 0.58, 0.86]} args={[0.22, 0.08, 0.22]} color="#efe8dc" />
      <Box position={[0, 0.66, 0.86]} args={[0.2, 0.08, 0.2]} color="#f4f0e6" />
    </group>
  );
}

export function PhlebChair({ slot }) {
  return (
    <group position={[slot.x, 0, slot.z]}>
      <Box position={[0, 0.46, 0.05]} args={[0.56, 0.1, 0.56]} color="#4a5c61" />
      <Box position={[0, 0.72, -0.24]} args={[0.56, 0.42, 0.08]} color="#4a5c61" />
      <Box position={[0.4, 0.62, 0.08]} args={[0.38, 0.08, 0.16]} color="#dfe4e2" />
      <mesh position={[0, 0.22, 0.18]}>
        <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
        <meshStandardMaterial color="#8b9699" metalness={0.35} roughness={0.35} />
      </mesh>
      <Box position={[0, 0.04, 0.18]} args={[0.32, 0.04, 0.32]} color="#3d4c50" />
    </group>
  );
}

export function LeadApron({ position, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Box position={[0, 1.05, 0]} args={[0.06, 0.08, 0.7]} color="#8b9699" metalness={0.4} />
      {[-0.22, 0, 0.22].map((z) => (
        <Box key={z} position={[0.04, 0.7, z]} args={[0.05, 0.9, 0.18]} color="#3d4c50" roughness={0.7} />
      ))}
    </group>
  );
}

export function ControlGlass({ position, w = 2.4 }) {
  return (
    <group position={position}>
      <Box position={[0, 0.72, 0]} args={[w, 1.28, 0.08]} color={PALETTE.glass} opacity={0.38} roughness={0.08} />
      <Box position={[0, 1.38, 0]} args={[w, 0.06, 0.1]} color="#d8e0e2" />
      <Box position={[-w / 2, 0.72, 0]} args={[0.06, 1.28, 0.1]} color="#d8e0e2" />
      <Box position={[w / 2, 0.72, 0]} args={[0.06, 1.28, 0.1]} color="#d8e0e2" />
    </group>
  );
}

export function ClinicalFridge({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.82, 0]} args={[0.52, 1.6, 0.48]} color="#dfe6e8" roughness={0.4} castShadow />
      <Box position={[0, 0.82, 0.23]} args={[0.44, 1.46, 0.04]} color="#cfd8da" />
      <Box position={[0.16, 1.15, 0.26]} args={[0.04, 0.12, 0.02]} color="#8b9699" />
      <Box position={[0, 1.48, 0.24]} args={[0.12, 0.04, 0.02]} color={PALETTE.led} emissive={PALETTE.led} emissiveIntensity={0.3} />
    </group>
  );
}

export function PFTBooth({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.7, 0]} args={[1.15, 1.38, 0.72]} color="#d8e0e0" roughness={0.5} />
      <Box position={[0, 1.05, 0.34]} args={[0.72, 0.52, 0.04]} color={PALETTE.glass} opacity={0.4} roughness={0.08} />
      <Box position={[0, 0.42, 0.2]} args={[0.7, 0.08, 0.36]} color="#c5d0d2" />
    </group>
  );
}

export function UltrasoundCart({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.52, 0]} args={[0.4, 0.95, 0.36]} color="#dfe4e6" roughness={0.45} castShadow />
      <Box position={[0, 1.08, 0.04]} args={[0.34, 0.26, 0.04]} color="#1c2628" emissive="#6ed4cc" emissiveIntensity={0.16} />
      <Box position={[0.18, 0.7, 0]} args={[0.04, 0.08, 0.12]} color="#8b9699" />
    </group>
  );
}

export function WallClock({ position }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.1, 0.1, 0.03, 16]} />
      <meshStandardMaterial color="#f4f8f8" roughness={0.4} />
    </mesh>
  );
}

export function DoorDrape({ room }) {
  return (
    <group>
      <Box
        position={[room.x - 0.85, 2.02, room.z - room.d / 2 + 0.55]}
        args={[0.04, 0.04, 0.9]}
        color="#8b9699"
        metalness={0.35}
      />
      <Box
        position={[room.x - 0.85, 1.1, room.z - room.d / 2 + 0.55]}
        args={[0.05, 1.8, 0.72]}
        color="#d2dee1"
        opacity={0.55}
        roughness={0.95}
      />
    </group>
  );
}

export function Desk({ station }) {
  return (
    <group position={[station.x, 0, station.z]}>
      <Box position={[0, 0.62, 0]} args={[station.w, 0.08, station.d]} color={PALETTE.deskTop} roughness={0.35} metalness={0.14} castShadow />
      <Box position={[0, 0.3, 0]} args={[station.w - 0.24, 0.56, station.d - 0.18]} color={PALETTE.desk} />
      {[-station.w / 3, station.w / 3].map((x) => (
        <group key={x}>
          <Box position={[x, 0.96, -station.d / 2 + 0.1]} args={[0.68, 0.44, 0.05]} color="#d5e2e4" roughness={0.16} metalness={0.18} />
          <Box position={[x, 0.96, -station.d / 2 + 0.08]} args={[0.52, 0.3, 0.02]} color="#1c2a2e" emissive="#8fd0c8" emissiveIntensity={0.18} />
        </group>
      ))}
    </group>
  );
}

export function NurseDesk({ station, hideCart }) {
  return (
    <group position={[station.x, 0, station.z]}>
      <Box position={[0, 0.66, 0]} args={[station.w, 0.1, station.d]} color={PALETTE.deskTop} roughness={0.32} metalness={0.14} castShadow />
      <Box position={[0, 0.34, 0]} args={[station.w - 0.16, 0.6, station.d - 0.16]} color={PALETTE.desk} />
      <Box position={[0, 1.12, station.d / 2 - 0.12]} args={[station.w - 0.4, 0.9, 0.08]} color="#d9e2e3" />
      {[-3.15, -1.05, 1.05, 3.15].map((x) => (
        <group key={x}>
          <Box position={[x, 1.16, -station.d / 2 + 0.16]} args={[0.74, 0.5, 0.06]} color="#d7e3e5" roughness={0.16} metalness={0.18} />
          <Box position={[x, 1.16, -station.d / 2 + 0.13]} args={[0.56, 0.34, 0.02]} color="#1a2629" emissive="#7ec8c0" emissiveIntensity={0.2} />
          <Box position={[x, 0.74, -station.d / 2 + 0.34]} args={[0.4, 0.04, 0.3]} color="#cfd6d4" />
        </group>
      ))}
      {!hideCart && <CrashCart position={[station.w / 2 + 0.7, 0, 0.4]} />}
    </group>
  );
}

export function CrashCart({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.55, 0]} args={[0.62, 1.05, 0.48]} color="#b23b32" roughness={0.5} castShadow />
      <Box position={[0, 0.55, 0.22]} args={[0.56, 0.9, 0.04]} color="#9a322b" />
      <Box position={[0, 1.1, 0]} args={[0.64, 0.06, 0.5]} color="#dfe4e5" />
    </group>
  );
}

export function CTGantry({ station }) {
  return (
    <group position={[station.x, 0, station.z]}>
      <mesh position={[0, 1.08, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.86, 0.2, 16, 32]} />
        <meshStandardMaterial color="#c5ced1" roughness={0.22} metalness={0.42} />
      </mesh>
      <Box position={[0, 1.08, 0]} args={[0.7, 1.7, 0.55]} color="#b7c2c6" metalness={0.28} roughness={0.3} />
      <Box position={[0, 0.24, 0]} args={[1.9, 0.24, 2.5]} color={PALETTE.frame} />
      <Box position={[0, 0.5, 0]} args={[0.72, 0.14, 2.05]} color={PALETTE.mattress} />
      <Box position={[0, 0.18, 1.4]} args={[0.9, 0.12, 0.7]} color="#8b9699" metalness={0.3} />
      <Box position={[1.35, 0.78, -0.9]} args={[0.7, 0.08, 0.55]} color={PALETTE.deskTop} />
      <Box position={[1.35, 1.02, -0.9]} args={[0.42, 0.28, 0.04]} color="#1c2628" emissive="#6ed4cc" emissiveIntensity={0.14} />
    </group>
  );
}

export function MRIGantry({ station }) {
  return (
    <group position={[station.x, 0, station.z]}>
      <mesh position={[0, 1.12, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.22, 1.22, 2.35, 28]} />
        <meshStandardMaterial color="#b3bec2" roughness={0.24} metalness={0.44} />
      </mesh>
      <mesh position={[0, 1.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.64, 0.64, 2.42, 24]} />
        <meshStandardMaterial color="#141b1d" roughness={0.55} />
      </mesh>
      <Box position={[0, 0.24, 1.55]} args={[0.72, 0.16, 1.5]} color={PALETTE.mattress} />
      <Box position={[0, 0.18, 0]} args={[2.6, 0.2, 2.8]} color="#d5dcde" />
      <Box position={[0, 0.06, 0]} args={[3.2, 0.04, 3.4]} color="#c45c4a" />
    </group>
  );
}

export function Elevators({ station }) {
  return (
    <group position={[station.x, 0, station.z]}>
      {[-1.18, 1.18].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Box position={[0, 1.35, 0]} args={[1.76, 2.7, 1.76]} color="#d8dfe0" roughness={0.48} />
          <Box position={[0, 1.2, 0.88]} args={[1.22, 2.2, 0.05]} color="#8fa0a6" metalness={0.5} roughness={0.22} />
          <Box position={[-0.28, 1.5, 0.92]} args={[0.06, 0.18, 0.04]} color="#d7c56a" emissive="#d7c56a" emissiveIntensity={0.4} />
        </group>
      ))}
      <Text position={[0, 2.85, 1.0]} fontSize={0.22} color="#5c6568" anchorX="center">
        Elevators
      </Text>
    </group>
  );
}

export function Shelves({ station }) {
  const w = station.w || 4.2;
  return (
    <group position={[station.x, 0, station.z]}>
      {[0, 0.55, 1.1, 1.65].map((y, i) => (
        <Box key={i} position={[0, 0.35 + y, 0]} args={[w, 0.06, 0.42]} color="#d7cfc2" />
      ))}
      {[-w / 2, 0, w / 2].map((x) => (
        <Box key={x} position={[x, 1.05, 0]} args={[0.06, 2.1, 0.42]} color="#c9c1b4" />
      ))}
      {[-1.2, -0.4, 0.4, 1.2].map((x, i) => (
        <Box key={x} position={[x, 0.7, 0]} args={[0.28, 0.32, 0.18]} color={i % 2 ? "#8aa4a0" : "#c47a6a"} />
      ))}
    </group>
  );
}

export function LabBench({ station }) {
  const w = station.w || 4;
  return (
    <group position={[station.x, 0, station.z]}>
      <Box position={[0, 0.72, 0]} args={[w, 0.08, station.d || 1.4]} color="#dfe4e2" roughness={0.4} castShadow />
      <Box position={[0, 0.36, 0]} args={[w - 0.2, 0.64, (station.d || 1.4) - 0.16]} color="#c5cecc" />
      {[-1.4, -0.35, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.92, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.24, 10]} />
          <meshStandardMaterial color="#9aa8ac" metalness={0.3} roughness={0.35} />
        </mesh>
      ))}
      <Box position={[1.6, 0.9, 0]} args={[0.42, 0.28, 0.32]} color="#d8e0e0" />
      <Box position={[1.6, 1.08, 0.04]} args={[0.3, 0.18, 0.02]} color="#1c2628" emissive="#6ed4cc" emissiveIntensity={0.12} />
      <Box position={[-w / 2 + 0.2, 1.05, 0]} args={[0.14, 0.2, 0.1]} color="#c45c28" />
    </group>
  );
}

export function WaitingTable({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.42, 0]} args={[1.15, 0.06, 0.55]} color="#d9d1c4" roughness={0.5} />
      <Box position={[0, 0.22, 0]} args={[0.08, 0.4, 0.08]} color="#b7aea0" />
      <Box position={[0, 0.48, 0]} args={[0.28, 0.02, 0.2]} color="#efe8dc" />
    </group>
  );
}

export function WallTV({ position, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Box position={[0, 1.55, 0]} args={[1.35, 0.78, 0.06]} color="#1c2426" />
      <Box position={[0, 1.55, 0.02]} args={[1.22, 0.66, 0.02]} color="#2a3a40" emissive="#3d5c63" emissiveIntensity={0.12} />
    </group>
  );
}

export function Plant({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.17, 0.13, 0.32, 10]} />
        <meshStandardMaterial color="#6b5344" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial color="#4f6b52" roughness={0.88} />
      </mesh>
      <mesh position={[0.12, 0.7, 0.08]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial color="#5d7a5c" roughness={0.9} />
      </mesh>
    </group>
  );
}

export function Tree({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 1.4, 8]} />
        <meshStandardMaterial color="#6b5344" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.85, 12, 12]} />
        <meshStandardMaterial color="#4a6750" roughness={0.92} />
      </mesh>
    </group>
  );
}

export function CeilingLights({ layout }) {
  const lights = [];
  const x0 = -layout.size.w / 2 + 4;
  const z0 = -layout.size.d / 2 + 4;
  for (let x = x0; x < layout.size.w / 2; x += 7.2) {
    for (let z = z0; z < layout.size.d / 2; z += 6.8) {
      lights.push(
        <group key={`${x}-${z}`} position={[x, layout.outerWall - 0.18, z]}>
          <Box args={[2.05, 0.05, 0.48]} color="#eef6f7" emissive="#e4f4f4" emissiveIntensity={0.85} roughness={0.22} />
          <Box position={[0, 0.04, 0]} args={[2.15, 0.03, 0.56]} color="#d5e2e4" />
          <mesh position={[0.95, -0.08, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.05, 12]} />
            <meshStandardMaterial color="#2a3c40" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0.95, -0.12, 0]}>
            <sphereGeometry args={[0.028, 10, 10]} />
            <meshStandardMaterial color={PALETTE.led} emissive={PALETTE.led} emissiveIntensity={0.9} />
          </mesh>
        </group>,
      );
    }
  }
  return <group>{lights}</group>;
}

export function ExteriorWindows({ layout }) {
  const w = layout.size.w;
  const d = layout.size.d;
  const h = 1.28;
  const y = 1.62;
  const panes = [];
  for (let x = -w / 2 + 5.5; x < w / 2 - 3.5; x += 5.2) {
    panes.push(
      <group key={`n-${x}`}>
        <Box position={[x, y, d / 2 - 0.1]} args={[2.5, h, 0.07]} color={PALETTE.glass} opacity={0.42} roughness={0.06} metalness={0.12} />
        <Box position={[x, y, d / 2 - 0.06]} args={[2.58, h + 0.1, 0.04]} color="#d8d0c4" />
      </group>,
    );
    if (Math.abs(x) > 5) {
      panes.push(
        <Box key={`s-${x}`} position={[x, y, -d / 2 + 0.1]} args={[2.5, h, 0.07]} color={PALETTE.glass} opacity={0.42} roughness={0.06} metalness={0.12} />,
      );
    }
  }
  return <group>{panes}</group>;
}

export function HallStripe({ layout }) {
  const hall = layout.zones.find((z) => z.kind === "circulation");
  if (!hall) return null;
  return (
    <group>
      <mesh position={[hall.x, 0.075, hall.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[Math.max(2, hall.w - 6), 0.22]} />
        <meshStandardMaterial color="#c5d2d6" roughness={0.9} />
      </mesh>
      <mesh position={[hall.x, 0.078, hall.z + 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.max(2, hall.w - 10), 0.07]} />
        <meshStandardMaterial color={PALETTE.led} emissive={PALETTE.led} emissiveIntensity={0.35} roughness={0.35} />
      </mesh>
    </group>
  );
}

export function Handrail({ layout }) {
  const hall = layout.zones.find((z) => z.kind === "circulation");
  if (!hall) return null;
  const z0 = hall.z - hall.d / 2 + 0.18;
  const z1 = hall.z + hall.d / 2 - 0.18;
  return (
    <group>
      <Box position={[hall.x, 0.92, z0]} args={[hall.w - 10, 0.04, 0.04]} color="#8b9699" metalness={0.4} roughness={0.3} />
      <Box position={[hall.x, 0.92, z1]} args={[hall.w - 10, 0.04, 0.04]} color="#8b9699" metalness={0.4} roughness={0.3} />
    </group>
  );
}

export function Parapet({ layout }) {
  const w = layout.size.w;
  const d = layout.size.d;
  const y = layout.outerWall + 0.12;
  return (
    <group>
      <Box position={[0, y, d / 2]} args={[w + 0.5, 0.38, 0.42]} color={PALETTE.wallCap} />
      <Box position={[0, y, -d / 2]} args={[w + 0.5, 0.38, 0.42]} color={PALETTE.wallCap} />
      <Box position={[w / 2, y, 0]} args={[0.42, 0.38, d + 0.5]} color={PALETTE.wallCap} />
      <Box position={[-w / 2, y, 0]} args={[0.42, 0.38, d + 0.5]} color={PALETTE.wallCap} />
    </group>
  );
}

export function Canopy({ layout }) {
  const e = layout.entrance;
  return (
    <group position={[e.x, 0, e.z - 1.4]}>
      <Box position={[0, 2.55, 0]} args={[8.4, 0.12, 3.2]} color="#e8f0f2" />
      <Box position={[-3.9, 1.3, 0.8]} args={[0.16, 2.5, 0.16]} color="#c5d4d8" />
      <Box position={[3.9, 1.3, 0.8]} args={[0.16, 2.5, 0.16]} color="#c5d4d8" />
      <Box position={[0, 2.62, 0]} args={[8.5, 0.03, 3.3]} color={PALETTE.led} emissive={PALETTE.led} emissiveIntensity={0.3} />
      <Text position={[0, 2.72, 0.2]} fontSize={0.32} color="#3d5c63" anchorX="center">
        {layout.floor === 2 ? "Fitkin Pavilion" : "South Pavilion"}
      </Text>
    </group>
  );
}

export function Directory({ layout }) {
  const hall = layout.zones.find((z) => z.kind === "circulation");
  if (!hall) return null;
  return (
    <group position={[hall.x - 8, 0, hall.z]}>
      <Box position={[0, 1.4, 0]} args={[0.12, 2.2, 1.1]} color="#2f474c" />
      <Box position={[0.08, 1.5, 0]} args={[0.04, 1.6, 0.9]} color="#dfe8ea" />
    </group>
  );
}

export function ParkedStretcher({ position, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Stretcher slot={{ x: 0, z: 0 }} />
    </group>
  );
}

export function Wheelchair({ position, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Box position={[0, 0.48, 0]} args={[0.48, 0.06, 0.42]} color="#4e595c" />
      <Box position={[0, 0.72, -0.16]} args={[0.48, 0.42, 0.06]} color="#3d5c63" />
      {[-0.26, 0.26].map((x) => (
        <mesh key={x} position={[x, 0.22, 0.05]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.05, 12]} />
          <meshStandardMaterial color="#2a3234" />
        </mesh>
      ))}
    </group>
  );
}
