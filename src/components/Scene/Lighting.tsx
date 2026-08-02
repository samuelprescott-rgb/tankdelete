export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.2} color="#a8b27b" />
      <hemisphereLight args={['#d8c786', '#15200f', 0.45]} />
      <pointLight position={[0, 20, 0]} intensity={0.65} color="#d49b45" />
    </>
  );
}
