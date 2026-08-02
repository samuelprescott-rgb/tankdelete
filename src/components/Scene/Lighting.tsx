export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.28} color="#8fa681" />
      <hemisphereLight args={['#b9cbb2', '#1b2815', 0.72]} />
      <directionalLight
        castShadow
        position={[-28, 38, 14]}
        intensity={1.48}
        color="#ffd08a"
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
      <directionalLight position={[20, 18, -26]} intensity={0.38} color="#78a99d" />
      <directionalLight position={[8, 10, 30]} intensity={0.18} color="#e5aa62" />
      <pointLight position={[0, 15, -8]} intensity={0.24} color="#e5b66c" distance={62} />
    </>
  );
}
