import {makeSmgFlash} from './ghostRoundArt';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { FinalBossAllyRole } from '../../lib/finalBossAllies';
import { infantryRifleBind } from '../../lib/infantryMetrics';
import { createInfantryRig, bindInfantryRig, releaseInfantryRig, updateInfantryRig, applyInfantryWeaponPose } from './infantryGeometry';
import { ALLY_PRESENTATION, createAllyBodyGeometry, createAllyWeaponGeometry, createAllyDepthMaterial, createProtectedAllyMaterial,
  createHorseBodyGeometry, createHorseLegGeometry, createCavalrySwordGeometry, HORSE_LEG_JOINTS } from './allyPresentationGeometry';

const FLASH_GEOMETRY = makeSmgFlash(.2,.32);
const FLASH_MATERIAL = new THREE.MeshBasicMaterial({ vertexColors:true, depthWrite:false, toneMapped:false });
const HORSE_HIPS: ReadonlyArray<[number, number, number]> = [[-0.255, 0.989, -0.48], [0.255, 0.989, -0.48], [-0.255, 0.989, 0.58], [0.255, 0.989, 0.58]];

function createHorseLegRig(hind: boolean) {
  const { knee, ankle } = hind ? HORSE_LEG_JOINTS.hind : HORSE_LEG_JOINTS.fore;
  const hipBone = new THREE.Bone(), kneeBone = new THREE.Bone(), hoof = new THREE.Bone();
  kneeBone.position.set(0, knee[0], knee[1]);
  hoof.position.set(0, ankle[0] - knee[0], ankle[1] - knee[1]);
  hipBone.add(kneeBone); kneeBone.add(hoof);
  const upperLength = Math.hypot(...knee), lowerLength = hoof.position.length();
  const restUpper = Math.atan2(-knee[1], -knee[0]);
  const restLower = Math.atan2(-hoof.position.z, -hoof.position.y);
  return { hipBone, kneeBone, hoof, skeleton: new THREE.Skeleton([hipBone, kneeBone, hoof]),
    hind, ankle, upperLength, lowerLength, restUpper, restLower, bound: false };
}

function poseHorseLeg(leg: ReturnType<typeof createHorseLegRig>, stride: number, blend: number, speed: number) {
  const cycle = ((stride % 1) + 1) % 1;
  const running = THREE.MathUtils.smoothstep(speed, 2, 7);
  const stance = THREE.MathUtils.lerp(.61, .44, running);
  const travel = cycle < stance ? cycle / stance : 1 - (cycle - stance) / (1 - stance);
  const lift = cycle < stance ? 0 : Math.sin(Math.PI * (cycle - stance) / (1 - stance)) ** 1.3;
  const z = leg.ankle[1] + (travel - .5) * THREE.MathUtils.lerp(.46, .71, running) * blend;
  const y = leg.ankle[0] + lift * THREE.MathUtils.lerp(.17, .28, running) * blend;
  const maxLength = leg.upperLength + leg.lowerLength - .001;
  const distance = Math.min(maxLength, Math.hypot(y, z));
  const aim = Math.atan2(-z, -y);
  const bend = Math.acos(THREE.MathUtils.clamp((leg.upperLength ** 2 + distance ** 2 - leg.lowerLength ** 2)
    / (2 * leg.upperLength * distance), -1, 1));
  const upper = aim + (leg.hind ? -1 : 1) * bend;
  const kneeY = -Math.cos(upper) * leg.upperLength, kneeZ = -Math.sin(upper) * leg.upperLength;
  const lower = Math.atan2(Math.sin(aim) * distance + kneeZ, Math.cos(aim) * distance + kneeY);
  leg.hipBone.rotation.x = upper - leg.restUpper;
  leg.kneeBone.rotation.x = lower - leg.restLower - leg.hipBone.rotation.x;
  leg.hoof.rotation.x = -leg.hipBone.rotation.x - leg.kneeBone.rotation.x + lift * .20 * blend;
}

export type AllyPresentationUpdate = (now: number, delta: number) => void;

/** One authoritative frame order: move actor, pose skeleton, refresh world
 * matrices, then let the caller sample the actual flash socket. */
export function syncFinalBossAllyPresentation(model: THREE.Group, position: THREE.Vector3, yaw: number,
  update: AllyPresentationUpdate | null | undefined, now: number, delta: number) {
  model.position.copy(position);
  model.rotation.set(0, yaw, 0);
  model.scale.setScalar(1);
  update?.(now, delta);
  model.updateWorldMatrix(true, true);
}

interface Props {
  role: FinalBossAllyRole;
  index: number;
  aimPitchRef: MutableRefObject<number[]>;
  firePulseRef: MutableRefObject<number[]>;
  presentationRefs: MutableRefObject<Array<AllyPresentationUpdate | null>>;
  setFlashRef: (node: THREE.Mesh | null) => void;
}

/** Presentation only. The parent retains every targeting, steering, cadence,
 * health, damage and defeat transition; animation never moves the actor root. */
export function FinalBossAllyPresentation({ role, index, aimPitchRef, firePulseRef, presentationRefs, setFlashRef }: Props) {
  const mounted = role === 'mounted-cavalry';
  const group = useRef<THREE.Group>(null), skin = useRef<THREE.SkinnedMesh>(null), weapon = useRef<THREE.Group>(null);
  const horseLegs = useRef<Array<THREE.SkinnedMesh | null>>([]);
  const rider = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const rig = useMemo(() => createInfantryRig(false), []);
  const summoningLight = useMemo(() => ({value: 0}), []);
  const height = useMemo(() => ({value: 1000}), []);
  const depth = useMemo(() => createAllyDepthMaterial(height), [height]);
  const material = useMemo(() => createProtectedAllyMaterial(summoningLight, height), [summoningLight, height]);
  const bodyGeometry = useMemo(() => createAllyBodyGeometry(role), [role]);
  const weaponGeometry = useMemo(() => mounted ? createCavalrySwordGeometry() : createAllyWeaponGeometry(role as 'heavy-gunner' | 'rifle-scout'), [role, mounted]);
  const horseBody = useMemo(() => mounted ? createHorseBodyGeometry() : null, [mounted]);
  const horseLeg = useMemo(() => mounted ? [createHorseLegGeometry(), createHorseLegGeometry(true)] : null, [mounted]);
  const horseRigs = useMemo(() => mounted ? HORSE_HIPS.map((_, i) => createHorseLegRig(i >= 2)) : [], [mounted]);
  const motion = useMemo(() => ({ previous: new THREE.Vector3(), initialized: false, cycle: -1,
    fromX: 0, fromZ: 0, toX: 0, toZ: 0, gait: 0, recoil: 0, horseBlend: 0 }), []);
  useLayoutEffect(() => {
    if (!skin.current) return;
    return bindInfantryRig(skin.current, rig);
  }, [rig]);
  useLayoutEffect(() => {
    const bindings = horseRigs.map((leg, i) => {
      const mesh = horseLegs.current[i];
      if (!mesh) return null;
      mesh.add(leg.hipBone);
      mesh.updateWorldMatrix(true, true);
      if (!leg.bound) { mesh.bind(leg.skeleton); leg.bound = true; }
      return mesh;
    });
    return () => bindings.forEach((mesh, i) => mesh?.remove(horseRigs[i].hipBone));
  }, [horseRigs]);
  useEffect(() => () => {
    releaseInfantryRig(rig);
    queueMicrotask(() => {
      if (rig.root.parent) return; // StrictMode re-attachment owns the same resources.
      bodyGeometry.dispose(); weaponGeometry.dispose(); material.dispose(); depth.dispose(); horseBody?.dispose();
      horseLeg?.forEach(geometry => geometry.dispose());
      horseRigs.forEach(leg => leg.skeleton.dispose());
    });
  }, [rig, bodyGeometry, weaponGeometry, material, depth, horseBody, horseLeg, horseRigs]);
  const updatePresentation = useCallback((now: number, delta: number) => {
    const actor = group.current?.parent;
    if (!actor || !actor.visible || !actor.parent?.visible) {
      motion.initialized = false; motion.recoil = 0; motion.gait = 0;
      motion.horseBlend = 0;
      rig.movement = 0; rig.contactReady = false;
      return;
    }
    summoningLight.value = actor.userData.summoningLight ?? 0;
    const reveal = actor.userData.arrivalReveal ?? 1;
    height.value = reveal >= 1 ? 1000 : actor.position.y - .06 + reveal * (mounted ? 3.45 : 2.10);
    const dt = Math.min(0.08, Math.max(0.001, delta));
    if (!motion.initialized) { motion.previous.copy(actor.position); motion.initialized = true; rig.contactReady = false; }
    const dx = actor.position.x - motion.previous.x, dz = actor.position.z - motion.previous.z;
    const travel = Math.hypot(dx, dz), moving = travel > 0.0004 && travel < 1.2;
    const speed = moving ? travel / dt : 0;
    motion.previous.copy(actor.position);
    const sinceShot = now - (firePulseRef.current[index] ?? -Infinity);
    motion.recoil = sinceShot >= 0 && sinceShot < 0.2 ? Math.exp(-sinceShot * 18) : 0;
    if (mounted) motion.gait += Math.min(speed / 2.5, 2.9) * Math.PI * dt;
    const period = 0.42, cycle = Math.floor(now / period);
    if (cycle !== motion.cycle || !moving) {
      motion.cycle = cycle; motion.fromX = actor.position.x; motion.fromZ = actor.position.z;
      motion.toX = actor.position.x + dx / dt * period; motion.toZ = actor.position.z + dz / dt * period;
    }
    updateInfantryRig(rig, { time: now, delta: dt, moving: !mounted && moving, progress: now / period - cycle,
      phase: index * 1.9, recoil: motion.recoil, aimPitch: mounted ? 0 : aimPitchRef.current[index] ?? 0,
      worldX: actor.position.x, worldZ: actor.position.z, worldYaw: actor.rotation.y, worldScale: 1,
      moveFromX: motion.fromX, moveFromZ: motion.fromZ, moveToX: motion.toX, moveToZ: motion.toZ,
      standingHipDrop: 0.13, holdingRifle: !mounted });
    if (mounted) {
      motion.horseBlend = THREE.MathUtils.damp(motion.horseBlend, Math.min(1, speed / 3), 8.5, dt);
      if (rider.current) rider.current.position.y = ALLY_PRESENTATION.riderOffsetY
        + 0.035 * (1 - Math.cos(motion.gait * 2)) * motion.horseBlend;
      rig.spine.rotation.x += 0.09 * motion.horseBlend;
      // Thighs open across the saddle, shins hang vertically outside the barrel.
      rig.legs.forEach((leg, legIndex) => {
        const side = legIndex ? 1 : -1;
        leg.upper.rotation.set(-0.12, 0, side * 0.88);
        leg.lower.rotation.set(0.12, 0, -side * 0.88);
        leg.foot.quaternion.copy(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
      });
      rig.root.updateMatrixWorld(true);
      horseRigs.forEach((leg, legIndex) => {
        const offset = legIndex === 0 || legIndex === 3 ? 0 : .5;
        poseHorseLeg(leg, motion.gait / Math.PI + offset + (leg.hind ? .07 : 0), motion.horseBlend, speed);
      });
    }
    if (weapon.current) applyInfantryWeaponPose(weapon.current, rig);
  }, [aimPitchRef, firePulseRef, horseRigs, index, mounted, motion, rig, summoningLight, height]);
  useLayoutEffect(() => {
    presentationRefs.current[index] = updatePresentation;
    return () => { presentationRefs.current[index] = null; };
  }, [index, presentationRefs, updatePresentation]);
  const rifle = infantryRifleBind(role === 'heavy-gunner' ? 'heavy' : 'scout', false);
  return (
    <group ref={group} dispose={null}>
      {mounted && horseBody && horseLeg && <>
        <mesh geometry={horseBody} material={material} customDepthMaterial={depth} castShadow receiveShadow />
        {HORSE_HIPS.map((position, legIndex) => <skinnedMesh key={legIndex} ref={node => { horseLegs.current[legIndex] = node; }}
          position={position} geometry={horseLeg[legIndex >= 2 ? 1 : 0]} material={material} customDepthMaterial={depth}
          castShadow receiveShadow frustumCulled={false} />)}
      </>}
      <group ref={rider} position-y={mounted ? ALLY_PRESENTATION.riderOffsetY : 0}>
        <skinnedMesh ref={skin} geometry={bodyGeometry} material={material} customDepthMaterial={depth} castShadow receiveShadow frustumCulled={false} />
        <group ref={weapon}>
          <mesh geometry={weaponGeometry} material={material} customDepthMaterial={depth} castShadow receiveShadow />
          {!mounted && <mesh ref={node => { flash.current = node; setFlashRef(node); }} geometry={FLASH_GEOMETRY} material={FLASH_MATERIAL}
            position={rifle.muzzle} rotation-x={-Math.PI / 2} visible={false} />}
        </group>
      </group>
    </group>
  );
}
