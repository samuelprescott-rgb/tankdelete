export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.34} color="#859169" />
      <hemisphereLight args={['#d5bd7b', '#14200f', 0.62]} />
      <directionalLight
        castShadow
        position={[-24, 34, 18]}
        intensity={1.08}
        color="#e0b96f"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={190}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[18, 14, -24]} intensity={0.32} color="#789b84" />
      <pointLight position={[0, 14, -8]} intensity={0.42} color="#c69247" distance={58} />
    </>
  );
}
