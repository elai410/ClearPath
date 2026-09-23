import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import EquipmentEntity from "./EquipmentEntity.jsx";
import FloorMesh from "./FloorMesh.jsx";
import PatientEntity from "./PatientEntity.jsx";
import RoomKitOverlay from "./RoomKitOverlay.jsx";
import { kitSections, sectionForItem } from "./equipment.js";
import { PALETTE } from "./palette.js";

function Lights() {
  return (
    <>
      <ambientLight intensity={0.4} color="#e8eef0" />
      <hemisphereLight args={["#e4eef1", "#b4c0bc", 0.5]} />
      <directionalLight
        position={[14, 32, 12]}
        intensity={0.95}
        color="#f4f8f9"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={110}
        shadow-camera-left={-52}
        shadow-camera-right={52}
        shadow-camera-top={44}
        shadow-camera-bottom={-44}
        shadow-bias={-0.00015}
      />
      <directionalLight position={[-14, 10, -8]} intensity={0.38} color="#d5e8ec" />
      <pointLight position={[-10, 5.2, -6]} intensity={0.55} distance={30} color="#c8ece8" />
      <pointLight position={[12, 5.2, 6]} intensity={0.5} distance={28} color="#d4f0ee" />
      <pointLight position={[0, 6.2, 10]} intensity={0.32} distance={26} color="#e4f2f4" />
    </>
  );
}

function FitCanvas() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;

    const apply = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w < 8 || h < 8) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      gl.setPixelRatio(dpr);
      gl.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      invalidate();
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(parent);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [gl, camera, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    const block = (e) => e.preventDefault();
    el.addEventListener("contextmenu", block);
    return () => el.removeEventListener("contextmenu", block);
  }, [gl]);

  return null;
}

function ZoomReporter({ onZoom }) {
  const camera = useThree((s) => s.camera);
  const last = useRef("");
  useFrame(() => {
    const y = camera.position.y;
    const level = y > 32 ? "far" : y > 16 ? "mid" : "near";
    if (level !== last.current) {
      last.current = level;
      onZoom(level);
    }
  });
  return null;
}

const OVERVIEW_CAM = new THREE.Vector3(12, 12, 18);
const OVERVIEW_TGT = new THREE.Vector3(0, 0.45, 0);
const UP = new THREE.Vector3(0, 1, 0);
const NAV_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyQ", "KeyE", "Equal", "NumpadAdd", "Minus", "NumpadSubtract", "Digit0",
  "ShiftLeft", "ShiftRight",
]);
const TMP_OFFSET = new THREE.Vector3();

function clampView(camera, controls) {
  const tx = THREE.MathUtils.clamp(controls.target.x, -42, 42);
  const tz = THREE.MathUtils.clamp(controls.target.z, -30, 30);
  const dx = tx - controls.target.x;
  const dz = tz - controls.target.z;
  if (dx || dz) {
    controls.target.x = tx;
    controls.target.z = tz;
    camera.position.x += dx;
    camera.position.z += dz;
  }
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, 4.2, 64);
  TMP_OFFSET.copy(camera.position).sub(controls.target);
  const dist = THREE.MathUtils.clamp(TMP_OFFSET.length(), 4.5, 72);
  if (TMP_OFFSET.lengthSq() > 0.0001) {
    TMP_OFFSET.setLength(dist);
    camera.position.copy(controls.target).add(TMP_OFFSET);
  }
}

function FlyTo({ target, nonce, flying }) {
  const camera = useThree((s) => s.camera);
  const { controls } = useThree();
  const start = useRef(null);
  const destCam = useRef(new THREE.Vector3());
  const destTgt = useRef(new THREE.Vector3());
  const t = useRef(1);

  useEffect(() => {
    if (!target || !controls) return;
    start.current = {
      cam: camera.position.clone(),
      tgt: controls.target.clone(),
    };
    if (target.overview) {
      destCam.current.copy(OVERVIEW_CAM);
      destTgt.current.copy(OVERVIEW_TGT);
    } else {
      destCam.current.set(target.x + 11, Math.max(9, (target.y || 14) * 0.7), target.z + 13);
      destTgt.current.set(target.x, 0.45, target.z);
    }
    t.current = 0;
    flying.current = true;
    controls.enabled = false;
  }, [nonce, target, camera, controls, flying]);

  useFrame((_, dt) => {
    if (!start.current || !controls || !target || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt * 0.95);
    const k = t.current * t.current * (3 - 2 * t.current);
    camera.position.lerpVectors(start.current.cam, destCam.current, k);
    controls.target.lerpVectors(start.current.tgt, destTgt.current, k);
    controls.update();
    if (t.current >= 1) {
      flying.current = false;
      controls.enabled = true;
    }
  });
  return null;
}

function KeyboardMove({ flying, onReset }) {
  const camera = useThree((s) => s.camera);
  const { controls } = useThree();
  const invalidate = useThree((s) => s.invalidate);
  const held = useRef({});
  const vel = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const wish = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());

  useEffect(() => {
    function typing(e) {
      const el = e.target;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    }
    const down = (e) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!NAV_KEYS.has(e.code)) return;
      held.current[e.code] = true;
      e.preventDefault();
      invalidate();
    };
    const up = (e) => {
      if (!NAV_KEYS.has(e.code)) return;
      held.current[e.code] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [invalidate]);

  useFrame((_, dt) => {
    if (!controls || flying.current) return;
    const d = Math.min(0.05, dt);
    const keys = held.current;
    const cam = forward.current;
    camera.getWorldDirection(cam);
    cam.y = 0;
    if (cam.lengthSq() < 0.0001) cam.set(0, 0, -1);
    cam.normalize();
    right.current.set(-cam.z, 0, cam.x);

    wish.current.set(0, 0, 0);
    if (keys.KeyW || keys.ArrowUp) wish.current.add(cam);
    if (keys.KeyS || keys.ArrowDown) wish.current.sub(cam);
    if (keys.KeyD || keys.ArrowRight) wish.current.add(right.current);
    if (keys.KeyA || keys.ArrowLeft) wish.current.sub(right.current);
    if (wish.current.lengthSq() > 0) {
      wish.current.normalize();
      const accel = keys.ShiftLeft || keys.ShiftRight ? 58 : 34;
      vel.current.addScaledVector(wish.current, accel * d);
    }
    vel.current.multiplyScalar(Math.max(0, 1 - 6.5 * d));
    const speed = vel.current.length();
    if (speed > 18) vel.current.multiplyScalar(18 / speed);
    let dirty = false;
    if (speed > 0.02) {
      camera.position.addScaledVector(vel.current, d);
      controls.target.addScaledVector(vel.current, d);
      dirty = true;
    }

    if (keys.KeyQ || keys.KeyE) {
      const angle = (keys.KeyQ ? 1 : -1) * 1.05 * d;
      offset.current.copy(camera.position).sub(controls.target);
      offset.current.applyAxisAngle(UP, angle);
      camera.position.copy(controls.target).add(offset.current);
      dirty = true;
    }

    if (keys.Equal || keys.NumpadAdd || keys.Minus || keys.NumpadSubtract) {
      const inward = keys.Equal || keys.NumpadAdd ? -1 : 1;
      offset.current.copy(camera.position).sub(controls.target);
      const next = THREE.MathUtils.clamp(offset.current.length() + inward * 16 * d, 4.5, 72);
      offset.current.setLength(next);
      camera.position.copy(controls.target).add(offset.current);
      dirty = true;
    }

    if (keys.Digit0) {
      keys.Digit0 = false;
      vel.current.set(0, 0, 0);
      onReset?.();
      return;
    }

    if (dirty) controls.update();
  });
  return null;
}

function SyncControls() {
  const done = useRef(false);
  const { controls } = useThree();
  useFrame(() => {
    if (done.current || !controls) return;
    controls.target.copy(OVERVIEW_TGT);
    controls.update();
    done.current = true;
  });
  return null;
}

function ViewClamp({ flying }) {
  const camera = useThree((s) => s.camera);
  const { controls } = useThree();
  useFrame(() => {
    if (!controls || flying.current) return;
    clampView(camera, controls);
  });
  return null;
}

function SceneBody({ occupied, selection, zoom, ranks, focus, onSelect, onZoom, layer, onReset }) {
  const flying = useRef(false);
  const equipment = occupied.equipment?.items || [];
  const sections = layer === "equipment" ? kitSections(occupied) : [];
  return (
    <>
      <FitCanvas />
      <color attach="background" args={[PALETTE.canvas]} />
      <fog attach="fog" args={[PALETTE.canvas, 78, 170]} />
      <Lights />
      <ZoomReporter onZoom={onZoom} />
      <FlyTo target={focus?.target} nonce={focus?.nonce} flying={flying} />
      <KeyboardMove flying={flying} onReset={onReset} />
      <FloorMesh occupied={occupied} selection={selection} onSelect={onSelect} layer={layer} />
      {layer !== "equipment" && occupied.placements.map((placement) => (
        <PatientEntity
          key={placement.patient.id}
          placement={placement}
          selected={selection?.type === "patient" && selection.id === placement.patient.id}
          zoom={zoom}
          rank={ranks?.[placement.patient.id] ?? 99}
          path={occupied.path}
          onSelect={onSelect}
        />
      ))}
      {layer === "equipment" && equipment.map((item) => {
        const home = sectionForItem(item);
        const selected = selection?.type === "asset"
          ? selection.id === item.id
          : Boolean(home && selection?.type === home.type && selection.id === home.id);
        return (
          <EquipmentEntity
            key={item.id}
            item={item}
            selected={selected}
            onSelect={onSelect}
          />
        );
      })}
      {layer === "equipment" && sections.map((section) => (
        <RoomKitOverlay
          key={`${section.type}-${section.id}`}
          section={section}
          selected={selection?.type === section.type && selection.id === section.id}
          zoom={zoom}
          onSelect={onSelect}
        />
      ))}
      <ContactShadows position={[0, 0.02, 0]} opacity={0.22} scale={110} blur={2.6} far={18} frames={1} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.062}
        screenSpacePanning
        zoomToCursor
        keyEvents={false}
        minPolarAngle={0.22}
        maxPolarAngle={Math.PI / 2.18}
        minDistance={4.5}
        maxDistance={72}
        zoomSpeed={0.68}
        panSpeed={0.76}
        rotateSpeed={0.4}
        target={[0, 0.35, 0]}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_ROTATE,
        }}
      />
      <SyncControls />
      <ViewClamp flying={flying} />
    </>
  );
}

export default function HospitalScene({ occupied, selection, zoom, ranks, focus, onSelect, onZoom, layer, onReset }) {
  const drag = useRef(false);
  const pointer = useRef(null);

  function selectIfClick(next) {
    if (drag.current) return;
    onSelect(next);
  }

  return (
    <Canvas
      className="command-canvas"
      dpr={[1, 1.75]}
      shadows
      resize={{ offsetSize: true, debounce: 0 }}
      camera={{ position: [12, 12, 18], fov: 42, near: 0.1, far: 260 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
      onPointerDown={(e) => {
        drag.current = false;
        pointer.current = { x: e.clientX ?? e.nativeEvent?.clientX, y: e.clientY ?? e.nativeEvent?.clientY };
      }}
      onPointerMove={(e) => {
        if (!pointer.current || e.buttons === 0) return;
        const x = e.clientX ?? e.nativeEvent?.clientX;
        const y = e.clientY ?? e.nativeEvent?.clientY;
        const dx = x - pointer.current.x;
        const dy = y - pointer.current.y;
        if (dx * dx + dy * dy > 25) drag.current = true;
      }}
      onPointerUp={() => { pointer.current = null; }}
      onPointerLeave={() => { pointer.current = null; }}
      onPointerMissed={() => {
        if (!drag.current) onSelect(null);
      }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(PALETTE.canvas, 1);
        gl.shadowMap.type = THREE.PCFShadowMap;
        camera.lookAt(0, 0.35, 0);
        const parent = gl.domElement.parentElement;
        if (parent && parent.clientWidth > 8) {
          const w = parent.clientWidth;
          const h = parent.clientHeight;
          gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
          gl.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      }}
    >
      <SceneBody
        occupied={occupied}
        selection={selection}
        zoom={zoom}
        ranks={ranks}
        focus={focus}
        onSelect={selectIfClick}
        onZoom={onZoom}
        layer={layer}
        onReset={onReset}
      />
    </Canvas>
  );
}
