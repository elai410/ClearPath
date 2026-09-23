import { Text } from "@react-three/drei";
import {
  Bed,
  Box,
  CTGantry,
  Cabinet,
  Canopy,
  CeilingLights,
  ClinicalFridge,
  ControlGlass,
  Curtain,
  Desk,
  Directory,
  Door,
  DoorDrape,
  Elevators,
  ExamCouch,
  ExamLight,
  ExamStool,
  ExteriorWindows,
  GloveDispenser,
  HallStripe,
  Handrail,
  HandSink,
  Headwall,
  LabBench,
  LeadApron,
  MRIGantry,
  NurseDesk,
  OverbedTable,
  PFTBooth,
  Parapet,
  ParkedStretcher,
  PhlebChair,
  Plant,
  RoomCove,
  RoomSoffit,
  Seat,
  SharpsBox,
  Shelves,
  SideTable,
  Stretcher,
  Tree,
  UltrasoundCart,
  WaitingTable,
  WallClock,
  WallTV,
  WasteBin,
  Wheelchair,
  Whiteboard,
} from "./Furniture.jsx";
import { PALETTE } from "./palette.js";
import { concreteMap, grassMap, linoleumMap, tileMap } from "./textures.js";

const BAY_ZONES = new Set(["ed-bays", "peds", "obs"]);
const EXAM_ZONES = new Set(["north", "dana", "ypb", "eye", "consults", "winchester"]);
const IMAGING_ZONES = new Set(["imaging", "mri"]);
const FLOOR_TINT = {
  bay: ["#ece6dc", "#ddd4c8"],
  exam: ["#e8eeec", "#dce4e2"],
  imaging: ["#d8e4e2", "#c8d4d2"],
  lab: ["#e2e8e6", "#d4dcd8"],
  pft: ["#e4ece8", "#d5e0dc"],
  pharmacy: ["#e6eadc", "#d8decc"],
  clinic: ["#e2e8ef", "#d4dce6"],
  generic: ["#eef3f4", "#dce6e8"],
};

function dressingKind(zoneId) {
  if (BAY_ZONES.has(zoneId)) return "bay";
  if (EXAM_ZONES.has(zoneId)) return "exam";
  if (IMAGING_ZONES.has(zoneId)) return "imaging";
  if (zoneId === "rabies") return "clinic";
  if (zoneId === "lab" || zoneId === "pft" || zoneId === "pharmacy") return zoneId;
  return "generic";
}

function roomSeed(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 33 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function ZoneFloor({ area, selected, onSelect }) {
  const congestion = area.congestion === "critical" ? 0.1 : area.congestion === "forming" ? 0.05 : 0;
  const rx = Math.max(2, area.w / 1.15);
  const rz = Math.max(2, area.d / 1.15);
  const map = area.kind === "circulation"
    ? linoleumMap("#d5e0e3", "#c8d4d8", rx, rz)
    : area.kind === "waiting" || area.kind === "intake"
      ? tileMap(area.color, "#dce6e8", rx, rz)
      : tileMap(area.color, "#e2eaec", rx, rz);
  return (
    <group>
      <mesh
        position={[area.x, 0.05, area.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.({ type: "zone", id: area.id });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[area.w - 0.12, area.d - 0.12]} />
        <meshStandardMaterial
          map={map}
          roughness={0.92}
          metalness={0}
          emissive={selected ? "#0f5c6b" : area.congestion === "critical" ? "#9f3b32" : "#000000"}
          emissiveIntensity={selected ? 0.08 : congestion}
        />
      </mesh>
      <Text
        position={[area.x, 0.09, area.z - area.d / 2 + 0.9]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.38}
        color="#5a6a6e"
        anchorX="center"
        anchorY="middle"
        maxWidth={area.w - 1.2}
      >
        {area.name.toUpperCase()}
      </Text>
    </group>
  );
}

function Wall({ wall }) {
  const h = wall.h || 1.42;
  if (wall.glass) {
    return (
      <group>
        <mesh position={[wall.x, h / 2, wall.z]}>
          <boxGeometry args={[wall.w, h, wall.d]} />
          <meshPhysicalMaterial
            color={PALETTE.glass}
            roughness={0.06}
            metalness={0.08}
            transmission={0.62}
            thickness={0.14}
            transparent
            opacity={0.34}
          />
        </mesh>
        <Box
          position={[wall.x, h + 0.02, wall.z]}
          args={[Math.max(wall.w, 0.08), 0.03, Math.max(wall.d, 0.08)]}
          color={PALETTE.led}
          emissive={PALETTE.led}
          emissiveIntensity={0.22}
          roughness={0.2}
        />
      </group>
    );
  }
  return (
    <group>
      <Box
        position={[wall.x, h / 2, wall.z]}
        args={[wall.w, h, wall.d]}
        color={PALETTE.wall}
        roughness={0.86}
        receiveShadow
        castShadow
      />
      <Box
        position={[wall.x, 0.07, wall.z]}
        args={[Math.max(wall.w, 0.08), 0.14, Math.max(wall.d, 0.08)]}
        color="#e4ecee"
        roughness={0.7}
      />
      <Box
        position={[wall.x, h + 0.025, wall.z]}
        args={[Math.max(wall.w, 0.1), 0.04, Math.max(wall.d, 0.1)]}
        color={PALETTE.led}
        emissive={PALETTE.led}
        emissiveIntensity={0.22}
        roughness={0.25}
      />
    </group>
  );
}

function Ground({ layout }) {
  const w = layout.size.w;
  const d = layout.size.d;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <planeGeometry args={[160, 120]} />
        <meshStandardMaterial map={grassMap()} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -d / 2 - 6]} receiveShadow>
        <planeGeometry args={[w + 28, 14]} />
        <meshStandardMaterial map={concreteMap()} roughness={0.95} />
      </mesh>
      <Box
        position={[0, 0.02, 0]}
        args={[w + 2.2, 0.1, d + 2.2]}
        color={PALETTE.slab}
        receiveShadow
      />
    </group>
  );
}

function RoomDressing({ room, kind }) {
  const flip = roomSeed(room.id) % 2 === 0 ? 1 : -1;
  const left = room.x - room.w / 2;
  const right = room.x + room.w / 2;
  const back = room.z + room.d / 2;
  const front = room.z - room.d / 2;
  const sinkX = room.x + flip * (room.w / 2 - 0.42);
  const cabX = room.x - flip * (room.w / 2 - 0.36);
  const wet = kind === "bay" || kind === "exam" || kind === "lab" || kind === "clinic";
  const clinical = kind === "bay" || kind === "exam";

  return (
    <group>
      <Door room={room} />
      <RoomCove room={room} />
      <RoomSoffit room={room} />
      <WasteBin position={[sinkX, 0, front + 0.48]} />
      <WallClock position={[room.x + flip * 0.7, 1.28, front + 0.08]} />
      <Box
        position={[room.x - 0.92, 1.22, front + 0.05]}
        args={[0.5, 0.2, 0.03]}
        color="#dfe6e6"
      />
      <Text
        position={[room.x - 0.92, 1.22, front + 0.08]}
        fontSize={0.16}
        color="#5c6568"
        anchorX="center"
      >
        {room.label}
      </Text>

      {wet && (
        <>
          <HandSink position={[sinkX, 0, back - 0.32]} />
          <GloveDispenser position={[sinkX - flip * 0.28, 1.28, back - 0.08]} />
          <SharpsBox position={[sinkX + flip * 0.18, 1.18, back - 0.1]} />
        </>
      )}

      {clinical && (
        <>
          <Headwall room={room} />
          <Cabinet position={[cabX, 0, room.z - 0.28]} />
          <Whiteboard
            position={[flip > 0 ? left + 0.08 : right - 0.08, 1.32, room.z - 0.55]}
            rot={flip > 0 ? Math.PI / 2 : -Math.PI / 2}
          />
          <ExamLight position={[room.x + flip * 0.55, 0, room.z + 0.15]} />
          <DoorDrape room={room} />
        </>
      )}

      {kind === "bay" && (
        <>
          <OverbedTable position={[room.x + flip * Math.min(room.w / 2 - 0.85, 2.2), 0, room.z + 0.1]} />
          <WasteBin position={[cabX, 0, back - 0.42]} bio />
          <SideTable position={[room.x - flip * 1.2, 0, room.z + 0.85]} />
          <Box
            position={[room.x, 0.07, room.z + 0.35]}
            args={[Math.min(room.w - 0.8, 5.6), 0.02, Math.min(room.d - 1.6, 3.6)]}
            color="#e4ddd2"
            roughness={0.95}
          />
        </>
      )}

      {kind === "exam" && (
        <>
          <ExamStool position={[room.x + flip * 0.95, 0, room.z + 0.15]} />
          <SideTable position={[cabX, 0, room.z + 0.95]} />
        </>
      )}

      {kind === "imaging" && (
        <>
          <Cabinet position={[left + 0.32, 0, back - 0.4]} />
          <LeadApron position={[right - 0.16, 0, room.z]} rot={-Math.PI / 2} />
          <ControlGlass position={[room.x + room.w / 2 - 1.4, 0, front + 1.15]} w={Math.min(2.6, room.w / 2)} />
          <GloveDispenser position={[left + 0.2, 1.28, front + 0.9]} rot={Math.PI / 2} />
          {/us/i.test(room.label) && (
            <UltrasoundCart position={[room.x + flip * 2.2, 0, room.z]} />
          )}
        </>
      )}

      {kind === "lab" && (
        <>
          <Cabinet position={[cabX, 0, room.z - 0.4]} />
          <Cabinet position={[cabX, 0, room.z + 1.1]} />
          <WasteBin position={[sinkX, 0, back - 0.5]} bio />
          <Whiteboard position={[room.x, 1.32, front + 0.08]} />
        </>
      )}

      {kind === "pft" && (
        <>
          <PFTBooth position={[room.x, 0, back - 0.55]} />
          <ExamStool position={[room.x + flip * 0.7, 0, room.z + 0.4]} />
          <Cabinet position={[cabX, 0, room.z]} />
          <Whiteboard position={[room.x, 1.32, front + 0.08]} />
        </>
      )}

      {kind === "pharmacy" && (
        <>
          <ClinicalFridge position={[left + 0.4, 0, room.z]} />
          <Cabinet position={[right - 0.36, 0, room.z - 0.6]} />
          <Cabinet position={[right - 0.36, 0, room.z + 0.8]} />
          <Whiteboard position={[room.x, 1.32, front + 0.08]} />
        </>
      )}

      {kind === "clinic" && (
        <>
          <ClinicalFridge position={[cabX, 0, room.z + 0.6]} />
          <Cabinet position={[cabX, 0, room.z - 0.7]} />
          <Whiteboard position={[room.x, 1.32, front + 0.08]} />
          <ExamStool position={[room.x + flip * 1.1, 0, room.z]} />
        </>
      )}
    </group>
  );
}

function WaitingSet({ area }) {
  if (area.kind !== "waiting" && area.kind !== "intake") return null;
  const tables = [];
  const cols = Math.max(1, Math.round(area.w / 8));
  for (let i = 0; i < cols; i += 1) {
    tables.push(
      <WaitingTable
        key={i}
        position={[area.x - area.w / 2 + 4 + i * 6.2, 0, area.z - 0.4]}
      />,
    );
  }
  return (
    <group>
      {tables}
      <WallTV position={[area.x, 0, area.z - area.d / 2 + 0.16]} />
      <Plant position={[area.x + area.w / 2 - 1.1, 0, area.z + area.d / 2 - 1.1]} />
      <Plant position={[area.x - area.w / 2 + 1.1, 0, area.z + area.d / 2 - 1.1]} />
    </group>
  );
}

export default function FloorMesh({ occupied, selection, onSelect, layer }) {
  const layout = occupied.layout;
  const selectedZone = selection?.type === "zone"
    ? selection.id
    : selection?.type === "room"
      ? layout.rooms.find((r) => r.id === selection.id)?.zoneId
      : null;

  const doubleRooms = layout.rooms.filter((room) =>
    layout.slots.filter((s) => s.roomId === room.id && s.kind === "bed").length >= 2,
  );

  return (
    <group>
      <Ground layout={layout} />
      <Canopy layout={layout} />
      <Tree position={[-layout.size.w / 2 - 4, 0, -layout.size.d / 2 - 4]} />
      <Tree position={[layout.size.w / 2 + 5, 0, -layout.size.d / 2 - 5]} />
      <Tree position={[layout.size.w / 2 + 6, 0, 8]} />
      <Tree position={[-layout.size.w / 2 - 5, 0, 10]} />

      {occupied.areas.map((area) => (
        <ZoneFloor
          key={area.id}
          area={area}
          selected={selectedZone === area.id}
          onSelect={onSelect}
        />
      ))}

      <HallStripe layout={layout} />
      <Handrail layout={layout} />
      {layout.walls.map((wall, i) => (
        <Wall key={`w-${i}`} wall={wall} />
      ))}
      <ExteriorWindows layout={layout} />
      <Parapet layout={layout} />
      <CeilingLights layout={layout} />
      <Directory layout={layout} />

      {layout.rooms.map((room) => {
        const kind = dressingKind(room.zoneId);
        const tint = FLOOR_TINT[kind] || FLOOR_TINT.generic;
        const selected = selection?.type === "room" && selection.id === room.id;
        return (
          <mesh
            key={room.id}
            position={[room.x, 0.09, room.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.({ type: "room", id: room.id });
            }}
          >
            <planeGeometry args={[room.w - 0.22, room.d - 0.22]} />
            <meshStandardMaterial
              map={tileMap(selected ? "#e8f1f2" : tint[0], tint[1], room.w, room.d)}
              roughness={0.95}
            />
          </mesh>
        );
      })}

      {layout.rooms.map((room) => (
        <RoomDressing
          key={`${room.id}-dress`}
          room={room}
          kind={dressingKind(room.zoneId)}
        />
      ))}

      {doubleRooms.map((room) => (
        <Curtain key={`${room.id}-curtain`} room={room} />
      ))}

      {layout.slots.filter((s) => s.kind === "seat" || s.kind === "holding" || s.kind === "visitor").map((slot) => (
        <Seat key={slot.id} slot={slot} />
      ))}
      {layout.slots.filter((s) => s.kind === "bed").map((slot) => {
        if (slot.zoneId === "pharmacy") return null;
        if (EXAM_ZONES.has(slot.zoneId) || slot.zoneId === "rabies") {
          return <ExamCouch key={slot.id} slot={slot} />;
        }
        return <Bed key={slot.id} slot={slot} />;
      })}
      {layout.slots.filter((s) => s.kind === "treatment").map((slot) => {
        if (slot.zoneId === "lab") return <PhlebChair key={slot.id} slot={slot} />;
        return <Stretcher key={slot.id} slot={slot} />;
      })}

      {occupied.areas.map((area) => (
        <WaitingSet key={`${area.id}-wait`} area={area} />
      ))}

      {layer !== "equipment" && (
        <>
          <ParkedStretcher position={[layout.entrance.x + 8, 0, layout.zones.find((z) => z.kind === "circulation")?.z || 0]} rot={1.57} />
          <Wheelchair position={[layout.entrance.x - 6.5, 0, layout.zones.find((z) => z.kind === "circulation")?.z || 0]} rot={0.4} />
        </>
      )}
      <Plant position={[layout.entrance.x - 3.4, 0, layout.entrance.z + 1.8]} />
      <Plant position={[layout.entrance.x + 3.4, 0, layout.entrance.z + 1.8]} />

      {layout.stations.map((station) => {
        if (station.kind === "nurse-desk") {
          return <NurseDesk key={station.id} station={station} hideCart={layer === "equipment"} />;
        }
        if (station.kind === "ct") {
          return (
            <group key={station.id} onClick={(e) => { e.stopPropagation(); onSelect?.({ type: "resource", id: station.id }); }}>
              <CTGantry station={station} />
            </group>
          );
        }
        if (station.kind === "mri") {
          return (
            <group key={station.id} onClick={(e) => { e.stopPropagation(); onSelect?.({ type: "resource", id: station.id }); }}>
              <MRIGantry station={station} />
            </group>
          );
        }
        if (station.kind === "elevators") return <Elevators key={station.id} station={station} />;
        if (station.kind === "shelves") return <Shelves key={station.id} station={station} />;
        if (station.kind === "lab-bench") return <LabBench key={station.id} station={station} />;
        return (
          <group key={station.id} onClick={(e) => { e.stopPropagation(); onSelect?.({ type: "resource", id: station.id }); }}>
            <Desk station={station} />
          </group>
        );
      })}
    </group>
  );
}
