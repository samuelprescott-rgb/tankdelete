import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createSupplyCrateGeometry, createSupplyCrateMaterial } from './supplyCrateGeometry';
import { applyPaintedFinish } from './paintedMaterials';

const MODEL = '/models/yughues-crates/Crate-04.obj';
const MAPS = ['/models/yughues-crates/diffuse.tga', '/models/yughues-crates/normal.tga'];

function normalizeCrate(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -bounds.min.y, -center.z);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function CrateBatch({ geometry, material }: { geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const pose = new THREE.Object3D();
    [[0, 0, 0], [0.7, 0, 0], [0.35, 0.62, 0]].forEach(([x, y, z], index) => {
      pose.position.set(x, y, z); pose.rotation.y = index * 0.08; pose.scale.setScalar(0.62); pose.updateMatrix();
      mesh.current!.setMatrixAt(index, pose.matrix);
    });
    mesh.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingBox(); mesh.current.computeBoundingSphere();
  }, []);
  return <instancedMesh ref={mesh} args={[undefined, undefined, 3]} geometry={geometry} material={material} receiveShadow castShadow dispose={null} />;
}

function FallbackCrates() {
  const geometry = useMemo(() => normalizeCrate(createSupplyCrateGeometry()), []);
  const material = useMemo(() => applyPaintedFinish(createSupplyCrateMaterial(), {
    scale: 1.3, strength: .7, edge: .65,
  }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <CrateBatch geometry={geometry} material={material} />;
}

function AuthoredCrates() {
  const source = useLoader(OBJLoader, MODEL);
  const maps = useLoader(TGALoader, MAPS);
  const geometry = useMemo(() => {
    const pieces: THREE.BufferGeometry[] = [];
    source.updateWorldMatrix(true, true);
    source.traverse(node => {
      if (node instanceof THREE.Mesh) pieces.push(node.geometry.clone().applyMatrix4(node.matrixWorld));
    });
    const merged = mergeGeometries(pieces, false);
    pieces.forEach(piece => piece.dispose());
    if (!merged) throw new Error('Supply crate mesh attributes do not match');
    return normalizeCrate(merged);
  }, [source]);
  const owned = useMemo(() => {
    const diffuse = maps[0].clone(), normal = maps[1].clone();
    diffuse.colorSpace = THREE.SRGBColorSpace; normal.colorSpace = THREE.NoColorSpace;
    diffuse.anisotropy = normal.anisotropy = 4;
    diffuse.needsUpdate = normal.needsUpdate = true;
    const material = applyPaintedFinish(new THREE.MeshStandardMaterial({
      map: diffuse, normalMap: normal, normalScale: new THREE.Vector2(0.16, 0.16),
      color: '#c4af8a', roughness: 0.96,
    }), { scale: 1.3, strength: .85, edge: .8 });
    return { diffuse, normal, material };
  }, [maps]);
  useEffect(() => () => {
    geometry.dispose(); owned.material.dispose(); owned.diffuse.dispose(); owned.normal.dispose();
  }, [geometry, owned]);
  return <CrateBatch geometry={geometry} material={owned.material} />;
}

/** Local suspension leaves the arena playable while the tiny CC0 prop loads. */
class CrateAssetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <FallbackCrates /> : this.props.children; }
}

export function SupplyCrates() {
  return <group name="roadside-supply-crates" position={[7.8, -0.046, -6.7]} rotation={[0, -0.24, 0]}>
    <CrateAssetBoundary><Suspense fallback={<FallbackCrates />}><AuthoredCrates /></Suspense></CrateAssetBoundary>
  </group>;
}
