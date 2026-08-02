export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.24} color="#7f8b62" />
      <hemisphereLight args={['#c0ae70', '#17200f', 0.46]} />
      <directionalLight position={[-24, 34, 18]} intensity={0.76} color="#d1af6b" />
      <pointLight position={[0, 16, -10]} intensity={0.3} color="#c69247" distance={64} />
    </>
  );
}
