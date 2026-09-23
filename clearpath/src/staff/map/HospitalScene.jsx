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

function FlyTo({ target, nonce }) {
  const camera = useThree((s) => s.camera);
  const { controls } = useThree();
  const start = useRef(null);
  const t = useRef(1);

  useEffect(() => {
    if (!target || !controls) return;
    start.current = {
      cam: camera.position.clone(),
      tgt: controls.target.clone(),
    };
    t.current = 0;
  }, [nonce, target, camera, controls]);

  useFrame((_, dt) => {
    if (!start.current || !controls || !target || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt * 1.7);
    const k = 1 - (1 - t.current) ** 3;
    const destCam = new THREE.Vector3(target.x + 13, Math.max(8.5, (target.y || 14) * 0.62), target.z + 15);
    const destTgt = new THREE.Vector3(target.x, 0.45, target.z);
    camera.position.lerpVectors(start.current.cam, destCam, k);
    controls.target.lerpVectors(start.current.tgt, destTgt, k);
    controls.update();
  });
  return null;
}

function KeyboardMove() {
  const camera = useThree((s) => s.camera);
  const { controls } = useThree();
  const held = useRef({});

  useEffect(() => {
    function typing(e) {
      const el = e.target;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    }
    const down = (e) => {
      if (typing(e)) return;
      held.current[e.code] = true;
    };
    const up = (e) => {
      held.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, dt) => {
    if (!controls) return;
    const keys = held.current;
    const boost = keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1;
    const speed = 26 * dt * boost;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3().set(-forward.z, 0, forward.x);
    const move = new THREE.Vector3();
    if (keys.KeyW || keys.ArrowUp) move.add(forward);
    if (keys.KeyS || keys.ArrowDown) move.sub(forward);
    if (keys.KeyD || keys.ArrowRight) move.add(right);
    if (keys.KeyA || keys.ArrowLeft) move.sub(right);
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(speed);
    camera.position.add(move);
    controls.target.add(move);
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -48, 48);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -36, 36);
    controls.update();
  });
  return null;
}

function SceneBody({ occupied, selection, zoom, ranks, focus, onSelect, onZoom, layer }) {
  const equipment = occupied.equipment?.items || [];
  const sections = layer === "equipment" ? kitSections(occupied) : [];
  return (
    <>
      <FitCanvas />
      <color attach="background" args={[PALETTE.canvas]} />
      <fog attach="fog" args={[PALETTE.canvas, 78, 170]} />
      <Lights />
      <ZoomReporter onZoom={onZoom} />
      <FlyTo target={focus?.target} nonce={focus?.nonce} />
      <KeyboardMove />
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
        dampingFactor={0.1}
        screenSpacePanning
        minPolarAngle={0.42}
        maxPolarAngle={Math.PI / 2.25}
        minDistance={5}
        maxDistance={88}
        zoomSpeed={1.25}
        panSpeed={1.55}
        rotateSpeed={0.68}
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
    </>
  );
}

export default function HospitalScene({ occupied, selection, zoom, ranks, focus, onSelect, onZoom, layer }) {
  const drag = useRef(false);

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
      camera={{ position: [24, 16, 28], fov: 42, near: 0.1, far: 260 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
      onPointerDown={() => { drag.current = false; }}
      onPointerMove={(e) => {
        if (e.buttons) drag.current = true;
      }}
      onPointerMissed={() => {
        if (!drag.current) onSelect(null);
      }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(PALETTE.canvas, 1);
        gl.shadowMap.type = THREE.PCFShadowMap;
        camera.lookAt(0, 0.3, 0);
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
      />
    </Canvas>
  );
}
