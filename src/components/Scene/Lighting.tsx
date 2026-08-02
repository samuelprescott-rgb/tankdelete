export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.18} color="#77805b" />
      <hemisphereLight args={['#a99b65', '#12190d', 0.34]} />
      <directionalLight position={[-24, 34, 18]} intensity={0.58} color="#c8aa68" />
      <pointLight position={[0, 16, -10]} intensity={0.24} color="#c69247" distance={64} />
    </>
  );
}
