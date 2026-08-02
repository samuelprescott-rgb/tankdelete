export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.42} color="#a6b997" />
      <hemisphereLight args={['#d3ddc3', '#283820', 0.9]} />
      <directionalLight
        castShadow
        position={[-28, 38, 14]}
        intensity={1.62}
        color="#ffd69a"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={190}
        shadow-camera-left={-72}
        shadow-camera-right={72}
        shadow-camera-top={72}
        shadow-camera-bottom={-72}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[20, 18, -26]} intensity={0.52} color="#9fc4ad" />
      <directionalLight position={[-12, 16, -6]} intensity={0.34} color="#c9d5a5" />
      <directionalLight position={[8, 10, 30]} intensity={0.28} color="#efb873" />
      <pointLight position={[0, 15, -8]} intensity={0.34} color="#ebc27c" distance={68} />
    </>
  );
}
