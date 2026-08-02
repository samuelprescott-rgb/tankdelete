import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CombatObstacle,
  EnemyCombatant,
  EnemyFireEvent,
  EnemyTankHitEvent,
  ENEMY_RIFLE_DAMAGE,
  ENEMY_RIFLE_LIFETIME,
  ENEMY_RIFLE_SPEED,
  findNearestObstacleHit,
  hashCombatSession,
  segmentSphereIntersection,
  terrainBlocksCombatSegment,
} from '../../lib/combat';

const HOSTILE_PROJECTILE_CAPACITY = 48;
const TANK_HIT_RADIUS = 0.95;
const TRACER_LENGTH = 0.72;
const MAX_ENGAGEMENT_RANGE = 48;

const UNIFORM_PALETTES = [
  { shirt: '#151b28', trousers: '#101522', webbing: '#646251' },
  { shirt: '#202536', trousers: '#151a27', webbing: '#716b55' },
  { shirt: '#1b2328', trousers: '#11181d', webbing: '#5d624e' },
] as const;

interface HostileProjectile {
  active: boolean;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
  shooterId: string;
}

interface FighterRuntime {
  nextShotAt: number;
  shotIndex: number;
  flashUntil: number;
}

export interface VietCongCombatantsProps {
  enemies: readonly EnemyCombatant[];
  tankRef: RefObject<THREE.Group | null>;
  /** Optional hut/structure volumes. Enemy rounds stop safely without touching file handlers. */
  obstacles?: readonly CombatObstacle[];
  onTankHit?: (event: EnemyTankHitEvent) => void;
  onEnemyFire?: (event: EnemyFireEvent) => void;
  enabled?: boolean;
  maxEngagementRange?: number;
}

function shotNoise(enemyId: string, shotIndex: number, salt: number) {
  const seed = hashCombatSession(enemyId);
  const value = Math.sin(seed * 0.00013 + shotIndex * 81.721 + salt * 19.117) * 43758.5453;
  return value - Math.floor(value);
}

function CylinderBetween({
  start,
  end,
  radius,
  color,
}: {
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  color: string;
}) {
  const startPoint = new THREE.Vector3(...start);
  const endPoint = new THREE.Vector3(...end);
  const direction = endPoint.clone().sub(startPoint);
  const length = direction.length();
  const midpoint = startPoint.clone().lerp(endPoint, 0.5);
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );

  return (
    <mesh position={midpoint} quaternion={orientation} castShadow>
      <cylinderGeometry args={[radius * 0.86, radius, length, 6]} />
      <meshStandardMaterial color={color} roughness={0.98} />
    </mesh>
  );
}

function JungleConcealment({ index, kneeling }: { index: number; kneeling: boolean }) {
  const foliage = index % 3;
  const leafPalette = foliage === 0
    ? ['#263f20', '#365526', '#4b6a2d']
    : foliage === 1
      ? ['#1f381d', '#315126', '#526b2c']
      : ['#29441f', '#3e5b28', '#5c7132'];
  const coverHeight = kneeling ? 0.31 : 0.26;
  const clusters = [
    { x: -0.43, z: 0.04, scale: 1.02 },
    { x: 0.43, z: 0.09, scale: 0.92 },
    { x: -0.2, z: 0.25, scale: 0.72 },
    { x: 0.2, z: 0.28, scale: 0.68 },
  ];

  return (
    <group>
      {/* Low, open-centred jungle scrub gives concealment without masking the target silhouette. */}
      {clusters.map((cluster, clusterIndex) => (
        <group
          key={`${cluster.x}-${cluster.z}`}
          position={[cluster.x, 0, cluster.z]}
          scale={cluster.scale}
          rotation={[0, (index * 1.37 + clusterIndex * 0.71) % Math.PI, 0]}
        >
          {[-0.075, 0, 0.075].map((stemX, stemIndex) => (
            <group key={stemX} rotation={[0, stemIndex * 1.8, stemX * 1.8]}>
              <mesh position={[stemX, coverHeight * 0.48, 0]} rotation={[0, 0, stemX * 1.4]}>
                <cylinderGeometry args={[0.008, 0.014, coverHeight, 5]} />
                <meshStandardMaterial color="#3c3f25" roughness={1} />
              </mesh>
              <mesh
                position={[stemX * 1.8, coverHeight * (0.72 + stemIndex * 0.08), -0.015]}
                rotation={[0.25, stemIndex * 1.35, stemX * 2.1]}
                castShadow
              >
                <dodecahedronGeometry args={[0.13 + stemIndex * 0.012, 0]} />
                <meshStandardMaterial color={leafPalette[stemIndex]} roughness={1} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* A few broad fern fronds break the toy-like round-bush outline. */}
      {[-0.62, 0.61].map((side, sideIndex) => (
        <group key={side} position={[side, 0.035, 0.13]} rotation={[0, sideIndex ? -0.5 : 0.45, 0]}>
          {[-0.34, -0.17, 0, 0.17, 0.34].map((angle, frondIndex) => (
            <mesh
              key={angle}
              position={[Math.sin(angle) * 0.12, 0.14 + Math.cos(angle) * 0.055, 0]}
              rotation={[0.2, angle, -angle * 0.85]}
              castShadow
            >
              <boxGeometry args={[0.055, 0.28 - frondIndex * 0.012, 0.018]} />
              <meshStandardMaterial color={leafPalette[(frondIndex + 1) % leafPalette.length]} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function VietCongFighter({
  enemy,
  index,
  fighterRefs,
  torsoRefs,
  muzzleFlashRefs,
}: {
  enemy: EnemyCombatant;
  index: number;
  fighterRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  torsoRefs: React.MutableRefObject<Array<THREE.Group | null>>;
  muzzleFlashRefs: React.MutableRefObject<Array<THREE.Mesh | null>>;
}) {
  const kneeling = enemy.stance === 'kneeling';
  const palette = UNIFORM_PALETTES[enemy.uniformVariant % UNIFORM_PALETTES.length];
  const hipY = kneeling ? 0.25 : 0.38;
  const torsoY = kneeling ? 0.46 : 0.59;
  const headY = kneeling ? 0.72 : 0.86;
  const rifleY = kneeling ? 0.53 : 0.67;
  const concealmentRotation = Math.atan2(enemy.position[0], enemy.position[2]);

  return (
    <group position={enemy.position}>
      <group rotation={[0, concealmentRotation, 0]}>
        <JungleConcealment index={index} kneeling={kneeling} />
      </group>

      <group
        ref={node => { fighterRefs.current[index] = node; }}
        visible={enemy.alive}
        scale={0.96}
      >
        {/* Dark field clothing and web gear, sized to the compressed vehicle scale. */}
        <group ref={node => { torsoRefs.current[index] = node; }}>
        {kneeling ? (
          <>
            <mesh position={[-0.085, 0.16, 0.01]} rotation={[0.72, 0, 0.08]} castShadow>
              <cylinderGeometry args={[0.052, 0.064, 0.32, 6]} />
              <meshStandardMaterial color={palette.trousers} roughness={0.98} />
            </mesh>
            <mesh position={[0.09, 0.14, 0.09]} rotation={[1.18, 0, -0.08]} castShadow>
              <cylinderGeometry args={[0.052, 0.064, 0.28, 6]} />
              <meshStandardMaterial color={palette.trousers} roughness={0.98} />
            </mesh>
            <mesh position={[0.1, 0.055, 0.21]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <boxGeometry args={[0.1, 0.07, 0.22]} />
              <meshStandardMaterial color="#141610" roughness={1} />
            </mesh>
          </>
        ) : (
          <>
            {[-0.085, 0.085].map(legX => (
              <group key={legX}>
                <mesh position={[legX, 0.2, 0]} castShadow>
                  <cylinderGeometry args={[0.05, 0.063, 0.36, 6]} />
                  <meshStandardMaterial color={palette.trousers} roughness={0.98} />
                </mesh>
                <mesh position={[legX, 0.035, -0.035]} castShadow>
                  <boxGeometry args={[0.1, 0.075, 0.18]} />
                  <meshStandardMaterial color="#12140f" roughness={1} />
                </mesh>
              </group>
            ))}
          </>
        )}

        <mesh position={[0, hipY, 0.015]} castShadow>
          <boxGeometry args={[0.25, 0.18, 0.18]} />
          <meshStandardMaterial color={palette.trousers} roughness={0.98} />
        </mesh>
        <mesh position={[0, torsoY, 0]} castShadow>
          <boxGeometry args={[0.34, 0.34, 0.2]} />
          <meshStandardMaterial color={palette.shirt} roughness={0.96} />
        </mesh>

        {/* Crossed web straps and compact ammunition pouches. */}
        <mesh position={[-0.065, torsoY + 0.01, -0.106]} rotation={[0, 0, -0.28]}>
          <boxGeometry args={[0.035, 0.36, 0.018]} />
          <meshStandardMaterial color={palette.webbing} roughness={1} />
        </mesh>
        <mesh position={[0.065, torsoY + 0.01, -0.106]} rotation={[0, 0, 0.28]}>
          <boxGeometry args={[0.035, 0.36, 0.018]} />
          <meshStandardMaterial color={palette.webbing} roughness={1} />
        </mesh>
        {[-0.09, 0, 0.09].map(pouchX => (
          <mesh key={pouchX} position={[pouchX, torsoY - 0.15, -0.125]} castShadow>
            <boxGeometry args={[0.075, 0.09, 0.055]} />
            <meshStandardMaterial color="#62593b" roughness={1} />
          </mesh>
        ))}

          {/* Both arms now meet a shouldered rifle: trigger hand aft, support hand on the foregrip. */}
          <CylinderBetween
            start={[-0.145, torsoY + 0.105, -0.015]}
            end={[-0.13, rifleY + 0.045, -0.18]}
            radius={0.05}
            color={palette.shirt}
          />
          <CylinderBetween
            start={[-0.13, rifleY + 0.045, -0.18]}
            end={[-0.035, rifleY, -0.41]}
            radius={0.044}
            color={palette.shirt}
          />
          <CylinderBetween
            start={[0.15, torsoY + 0.1, -0.012]}
            end={[0.13, rifleY + 0.035, -0.12]}
            radius={0.05}
            color={palette.shirt}
          />
          <CylinderBetween
            start={[0.13, rifleY + 0.035, -0.12]}
            end={[0.055, rifleY - 0.002, -0.2]}
            radius={0.044}
            color={palette.shirt}
          />
          <mesh position={[-0.035, rifleY, -0.41]}>
            <sphereGeometry args={[0.052, 7, 5]} />
            <meshStandardMaterial color="#805d3f" roughness={1} />
          </mesh>
          <mesh position={[0.055, rifleY - 0.002, -0.2]}>
            <sphereGeometry args={[0.052, 7, 5]} />
            <meshStandardMaterial color="#805d3f" roughness={1} />
          </mesh>

        <mesh position={[0, headY - 0.095, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.1, 7]} />
          <meshStandardMaterial color="#76543a" roughness={1} />
        </mesh>
        <mesh position={[0, headY, -0.012]} castShadow>
          <sphereGeometry args={[0.11, 8, 6]} />
          <meshStandardMaterial color="#876044" roughness={1} />
        </mesh>

          {enemy.headwear === 'pith' ? (
            <group position={[0, headY + 0.115, 0]}>
              <mesh scale={[1, 1, 1.08]} castShadow>
                <cylinderGeometry args={[0.142, 0.178, 0.034, 12]} />
                <meshStandardMaterial color="#7d774c" roughness={1} />
              </mesh>
              <mesh position={[0, 0.048, 0.005]} scale={[1, 0.68, 1.05]} castShadow>
                <sphereGeometry args={[0.12, 10, 6]} />
                <meshStandardMaterial color="#666d43" roughness={1} />
              </mesh>
              <mesh position={[0, 0.045, -0.108]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.086, 0.009, 4, 12, Math.PI]} />
                <meshStandardMaterial color="#3f452e" roughness={1} />
              </mesh>
            </group>
          ) : (
            <group position={[0, headY + 0.115, 0]}>
              {/* Dark lacquered palm-leaf field hat, with woven ribs and a visible chin cord. */}
              <mesh position={[0, 0.025, 0]} castShadow>
                <coneGeometry args={[0.205, 0.095, 18]} />
                <meshStandardMaterial color="#282b28" roughness={1} side={THREE.DoubleSide} />
              </mesh>
              {[0.085, 0.137, 0.187].map((radius, ringIndex) => (
                <mesh key={radius} position={[0, -0.008 + ringIndex * 0.014, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[radius, 0.0055, 4, 18]} />
                  <meshStandardMaterial color="#111715" roughness={1} />
                </mesh>
              ))}
              {Array.from({ length: 9 }, (_, ribIndex) => {
                const angle = (ribIndex / 9) * Math.PI * 2;
                return (
                  <mesh
                    key={`hat-rib-${ribIndex}`}
                    position={[Math.sin(angle) * 0.09, 0.014, Math.cos(angle) * 0.09]}
                    rotation={[0, angle, 0]}
                  >
                    <boxGeometry args={[0.007, 0.007, 0.185]} />
                    <meshStandardMaterial color="#3b3c35" roughness={1} />
                  </mesh>
                );
              })}
              <CylinderBetween
                start={[-0.14, -0.005, 0]}
                end={[-0.045, -0.16, -0.045]}
                radius={0.006}
                color="#171814"
              />
              <CylinderBetween
                start={[0.14, -0.005, 0]}
                end={[0.045, -0.16, -0.045]}
                radius={0.006}
                color="#171814"
              />
            </group>
          )}

          {/* Shouldered, wood-stocked rifle with AK-pattern gas tube and curved magazine. */}
          <group position={[0.025, rifleY, -0.1]}>
            <mesh position={[0.025, 0.012, 0.13]} rotation={[0.03, 0, -0.04]} castShadow>
              <boxGeometry args={[0.105, 0.105, 0.31]} />
              <meshStandardMaterial color="#6a4228" roughness={0.88} />
            </mesh>
            <mesh position={[0, 0, -0.105]} castShadow>
              <boxGeometry args={[0.09, 0.095, 0.2]} />
              <meshStandardMaterial color="#252821" roughness={0.72} metalness={0.35} />
            </mesh>
            <group position={[0, -0.1, -0.105]} rotation={[-0.2, 0, 0]}>
              <mesh position={[0, 0.005, 0.018]} rotation={[0.12, 0, 0]} castShadow>
                <boxGeometry args={[0.072, 0.15, 0.095]} />
                <meshStandardMaterial color="#3a3022" roughness={0.9} />
              </mesh>
              <mesh position={[0, -0.065, 0.055]} rotation={[0.22, 0, 0]} castShadow>
                <boxGeometry args={[0.07, 0.1, 0.08]} />
                <meshStandardMaterial color="#4b3726" roughness={0.92} />
              </mesh>
            </group>
            <mesh position={[0, 0.018, -0.345]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.018, 0.022, 0.38, 7]} />
              <meshStandardMaterial color="#20231e" roughness={0.7} metalness={0.45} />
            </mesh>
            <mesh position={[0, 0.052, -0.29]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.014, 0.016, 0.25, 6]} />
              <meshStandardMaterial color="#30352b" roughness={0.76} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.018, -0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.025, 0.018, 0.075, 7]} />
              <meshStandardMaterial color="#1d201c" roughness={0.75} metalness={0.48} />
            </mesh>
            <mesh
              ref={node => { muzzleFlashRefs.current[index] = node; }}
              position={[0, 0.018, -0.62]}
              rotation={[-Math.PI / 2, 0, 0]}
              visible={false}
              renderOrder={85}
            >
              <coneGeometry args={[0.085, 0.22, 7]} />
              <meshBasicMaterial
                color="#ffd36a"
                transparent
                opacity={0.94}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

export function VietCongCombatants({
  enemies,
  tankRef,
  obstacles = [],
  onTankHit,
  onEnemyFire,
  enabled = true,
  maxEngagementRange = MAX_ENGAGEMENT_RANGE,
}: VietCongCombatantsProps) {
  const fighterRefs = useRef<Array<THREE.Group | null>>([]);
  const torsoRefs = useRef<Array<THREE.Group | null>>([]);
  const muzzleFlashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const tracerRefs = useRef<Array<THREE.Group | null>>([]);
  const runtimeByEnemyRef = useRef(new Map<string, FighterRuntime>());

  const projectilePool = useMemo<HostileProjectile[]>(() => (
    Array.from({ length: HOSTILE_PROJECTILE_CAPACITY }, () => ({
      active: false,
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      lifetime: 0,
      shooterId: '',
    }))
  ), []);

  const tankCenter = useMemo(() => new THREE.Vector3(), []);
  const muzzlePosition = useMemo(() => new THREE.Vector3(), []);
  const aimDirection = useMemo(() => new THREE.Vector3(), []);
  const impactPosition = useMemo(() => new THREE.Vector3(), []);
  const tracerForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const tracerQuaternion = useMemo(() => new THREE.Quaternion(), []);

  const spawnHostileRound = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    shooterId: string,
  ) => {
    const projectile = projectilePool.find(candidate => !candidate.active);
    if (!projectile) return false;
    projectile.active = true;
    projectile.position.copy(position);
    projectile.previousPosition.copy(position);
    projectile.direction.copy(direction).normalize();
    projectile.lifetime = 0;
    projectile.shooterId = shooterId;
    return true;
  };

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;

    for (const tracer of tracerRefs.current) {
      if (tracer) tracer.visible = false;
    }

    if (!enabled) {
      for (const projectile of projectilePool) projectile.active = false;
      for (const flash of muzzleFlashRefs.current) if (flash) flash.visible = false;
      return;
    }

    const tank = tankRef.current;
    if (tank) {
      tank.getWorldPosition(tankCenter);
      tankCenter.y += 0.64;
    }

    enemies.forEach((enemy, index) => {
      const fighter = fighterRefs.current[index];
      const torso = torsoRefs.current[index];
      const flash = muzzleFlashRefs.current[index];
      if (!enemy.alive) {
        if (fighter) fighter.visible = false;
        if (flash) flash.visible = false;
        return;
      }

      let runtime = runtimeByEnemyRef.current.get(enemy.id);
      if (!runtime) {
        runtime = {
          nextShotAt: now + enemy.initialFireDelay,
          shotIndex: 0,
          flashUntil: 0,
        };
        runtimeByEnemyRef.current.set(enemy.id, runtime);
      }

      if (fighter) {
        fighter.visible = true;
        if (tank) {
          const dx = tankCenter.x - enemy.position[0];
          const dz = tankCenter.z - enemy.position[2];
          fighter.rotation.y = Math.atan2(-dx, -dz);
        }
        const idlePhase = now * (0.48 + index * 0.014) + index * 1.67;
        fighter.position.x = Math.sin(idlePhase) * (enemy.stance === 'kneeling' ? 0.006 : 0.014);
        fighter.position.y = Math.sin(idlePhase * 1.7) * 0.006;
        fighter.rotation.z = Math.sin(idlePhase * 0.82) * (enemy.stance === 'kneeling' ? 0.006 : 0.014);
      }
      if (torso) {
        const firingRecoil = now < runtime.flashUntil ? 0.018 : 0;
        torso.rotation.x = Math.sin(now * 0.72 + index * 1.31) * 0.008;
        torso.rotation.z = Math.sin(now * 1.1 + index * 1.73) * 0.012;
        torso.position.y = Math.sin(now * 1.2 + index) * 0.008;
        torso.position.z = firingRecoil;
      }
      if (flash) {
        flash.visible = now < runtime.flashUntil;
        if (flash.visible) {
          flash.scale.setScalar(0.82 + Math.sin(now * 145 + index) * 0.18);
        }
      }

      if (!tank || now < runtime.nextShotAt) return;

      muzzlePosition.set(
        enemy.position[0],
        enemy.position[1] + (enemy.stance === 'kneeling' ? 0.53 : 0.67),
        enemy.position[2],
      );
      aimDirection.copy(tankCenter).sub(muzzlePosition);
      const distance = aimDirection.length();
      if (distance > maxEngagementRange || distance < 3.2) {
        runtime.nextShotAt = now + 0.45;
        return;
      }

      // Keep terrain and huts tactically meaningful; concealed soldiers do not shoot through them.
      const obstacleHitT = findNearestObstacleHit(muzzlePosition, tankCenter, obstacles);
      if (terrainBlocksCombatSegment(muzzlePosition, tankCenter)
        || (obstacleHitT !== null && obstacleHitT < 0.88)) {
        runtime.nextShotAt = now + 0.42;
        return;
      }

      aimDirection.normalize();
      const shotIndex = runtime.shotIndex++;
      aimDirection.x += (shotNoise(enemy.id, shotIndex, 1) - 0.5) * enemy.accuracy * 2;
      aimDirection.y += (shotNoise(enemy.id, shotIndex, 2) - 0.5) * enemy.accuracy * 0.8;
      aimDirection.z += (shotNoise(enemy.id, shotIndex, 3) - 0.5) * enemy.accuracy * 2;
      aimDirection.normalize();

      // Move the logical muzzle to the visible rifle tip along the aimed heading.
      muzzlePosition.addScaledVector(aimDirection, 0.62);
      if (spawnHostileRound(muzzlePosition, aimDirection, enemy.id)) {
        runtime.flashUntil = now + 0.07;
        onEnemyFire?.({
          enemyId: enemy.id,
          position: muzzlePosition.clone(),
          direction: aimDirection.clone(),
        });
      }
      const cadenceVariation = 0.84 + shotNoise(enemy.id, shotIndex, 4) * 0.32;
      runtime.nextShotAt = now + enemy.fireInterval * cadenceVariation;
    });

    projectilePool.forEach((projectile, index) => {
      if (!projectile.active) return;
      projectile.previousPosition.copy(projectile.position);
      projectile.position.addScaledVector(projectile.direction, ENEMY_RIFLE_SPEED * delta);
      projectile.lifetime += delta;

      if (projectile.lifetime >= ENEMY_RIFLE_LIFETIME
        || terrainBlocksCombatSegment(projectile.previousPosition, projectile.position)) {
        projectile.active = false;
        return;
      }

      const obstacleHitT = projectile.lifetime > 0.08
        ? findNearestObstacleHit(projectile.previousPosition, projectile.position, obstacles)
        : null;
      const tankHitT = tank
        ? segmentSphereIntersection(
            projectile.previousPosition,
            projectile.position,
            tankCenter,
            TANK_HIT_RADIUS,
          )
        : null;

      if (tankHitT !== null && (obstacleHitT === null || tankHitT < obstacleHitT)) {
        impactPosition.copy(projectile.previousPosition).lerp(projectile.position, tankHitT);
        onTankHit?.({
          enemyId: projectile.shooterId,
          position: impactPosition.clone(),
          damage: ENEMY_RIFLE_DAMAGE,
        });
        projectile.active = false;
        return;
      }
      if (obstacleHitT !== null) {
        projectile.active = false;
        return;
      }

      const tracer = tracerRefs.current[index];
      if (!tracer) return;
      tracer.visible = true;
      tracer.position.copy(projectile.position);
      tracerQuaternion.setFromUnitVectors(tracerForward, projectile.direction);
      tracer.quaternion.copy(tracerQuaternion);
    });
  });

  return (
    <group>
      {enemies.map((enemy, index) => (
        <VietCongFighter
          key={enemy.id}
          enemy={enemy}
          index={index}
          fighterRefs={fighterRefs}
          torsoRefs={torsoRefs}
          muzzleFlashRefs={muzzleFlashRefs}
        />
      ))}

      {Array.from({ length: HOSTILE_PROJECTILE_CAPACITY }, (_, index) => (
        <group
          key={`hostile-tracer-${index}`}
          ref={node => { tracerRefs.current[index] = node; }}
          visible={false}
          renderOrder={88}
          frustumCulled={false}
        >
          <mesh position={[0, 0, -TRACER_LENGTH * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.024, 0.012, TRACER_LENGTH, 6]} />
            <meshBasicMaterial
              color="#ff8a4c"
              transparent
              opacity={0.95}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, -TRACER_LENGTH * 0.52]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.025, TRACER_LENGTH * 1.08, 6]} />
            <meshBasicMaterial
              color="#d94829"
              transparent
              opacity={0.24}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.065, 8, 6]} />
            <meshBasicMaterial
              color="#ffe3a0"
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
