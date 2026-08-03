export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.38} color="#96aa9a" />
      <hemisphereLight args={['#aebeb4', '#26351f', 0.78]} />
      <directionalLight
        castShadow
        position={[-28, 38, 14]}
        intensity={1.28}
        color="#d5d8c5"
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
      <directionalLight position={[20, 18, -26]} intensity={0.42} color="#8fb4aa" />
      <directionalLight position={[-12, 16, -6]} intensity={0.29} color="#b7c7af" />
      <directionalLight position={[8, 10, 30]} intensity={0.22} color="#c6b38a" />
      <pointLight position={[0, 15, -8]} intensity={0.28} color="#c8b684" distance={68} />
    </>
  );
}
