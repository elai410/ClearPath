import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export default function TrackMark({ color, selected, pingRef, scale = 1 }) {
  const ring = useRef();
  useFrame(() => {
    if (!ring.current || !pingRef) return;
    const t = pingRef.current;
    const mat = ring.current.material;
    ring.current.scale.setScalar(0.55 + t * 1.35);
    mat.opacity = Math.max(0, (1 - t) * 0.55);
  });
  const corners = [
    [-0.28, -0.22],
    [0.28, -0.22],
    [-0.28, 0.22],
    [0.28, 0.22],
  ];
  return (
    <group scale={scale}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.032, 0]}>
        <circleGeometry args={[0.26, 24]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.22 : 0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.034, 0]}>
        <ringGeometry args={[0.26, selected ? 0.34 : 0.3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.45} />
      </mesh>
      {corners.map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0.036, z]}>
          <mesh>
            <boxGeometry args={[0.08, 0.012, 0.016]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.016, 0.012, 0.08]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} />
          </mesh>
        </group>
      ))}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.2, 0.26, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
