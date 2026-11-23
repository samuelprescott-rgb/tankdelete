import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame,useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import {CHARCOAL_TEXTURE} from './rollingSmoke';
import { createSmokeFoldArt, SMOKE_FOLDS, smokeFoldDelay, writeParticle, writeSmokeFold } from './pixelSmokeFold';
import { useFireVolume } from './fireVolume';
import { createPhantomGeometries } from './phantomGeometry';
import { createNapalmScorchMaterial } from './napalmMaterials';
import { applyPaintedFinish } from './paintedMaterials';
import { napalmShadowMapsReady, prepareNapalmRender } from './prepareNapalmRender';
import { relayInkRenderBatch, flyoverRenderBatch } from './flyoverResources';
import {createStrikePerimeter,terminalMarkerInk,createTerminalAlphabet} from './terminalMarkers';
import {createLaughingFlameAtlas,laughingFlameMaterial} from './laughingFlame';
import { armedFileRenderBatch } from './armedFileInk';
import {
  NapalmStrike,
  NAPALM_HAZARD_SAMPLE_SECONDS,
  NAPALM_STRIKE_LENGTH,
  NAPALM_STRIKE_WIDTH,
  NAPALM_TIMELINE,
  NAPALM_FLIGHT_ENVELOPE,
} from '../../lib/weapons';

const FLAME_POCKETS = 18;
const SMOKE_SOURCES = 8;
const SMOKE_PARTICLES = SMOKE_SOURCES * SMOKE_FOLDS;
const EMBER_PARTICLE_COUNT = 42;
const SCORCH_PATCH_COUNT = 20;
const FLAME_ROOT_Y = -0.045;
const TARGET_FINISH = { color: '#d9b14a', transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false };
const SHOCKWAVE_FINISH = { color: '#ffd27a', transparent: true, opacity: 0.52,
  blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };

interface FireParticle {
  x: number;
  z: number;
  delay: number;
  phase: number;
  lifetime: number;
  rise: number;
  size: number;
  sway: number;
}

interface ScorchPatch {
  x: number;
  z: number;
  delay: number;
  scaleX: number;
  scaleZ: number;
  rotation: number;
}

function setHermitePosition(
  result: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startVelocity: THREE.Vector3,
  endVelocity: THREE.Vector3,
  duration: number,
  progress: number,
) {
  const progressSquared = progress * progress;
  const progressCubed = progressSquared * progress;
  const startWeight = 2 * progressCubed - 3 * progressSquared + 1;
  const startVelocityWeight = progressCubed - 2 * progressSquared + progress;
  const endWeight = -2 * progressCubed + 3 * progressSquared;
  const endVelocityWeight = progressCubed - progressSquared;

  result
    .copy(start)
    .multiplyScalar(startWeight)
    .addScaledVector(startVelocity, startVelocityWeight * duration)
    .addScaledVector(end, endWeight)
    .addScaledVector(endVelocity, endVelocityWeight * duration);
}

function setHermiteDirection(
  result: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startVelocity: THREE.Vector3,
  endVelocity: THREE.Vector3,
  duration: number,
  progress: number,
) {
  const progressSquared = progress * progress;
  const startWeight = 6 * progressSquared - 6 * progress;
  const startVelocityWeight = 3 * progressSquared - 4 * progress + 1;
  const endWeight = -6 * progressSquared + 6 * progress;
  const endVelocityWeight = 3 * progressSquared - 2 * progress;

  result
    .copy(start)
    .multiplyScalar(startWeight)
    .addScaledVector(startVelocity, startVelocityWeight * duration)
    .addScaledVector(end, endWeight)
    .addScaledVector(endVelocity, endVelocityWeight * duration)
    .normalize();
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

// Shared by compact secondary fire effects so their flame language stays
// consistent with the authored napalm strike without duplicating the texture.
export function createFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath();
  context.moveTo(34, 2);
  context.bezierCurveTo(23, 22, 8, 54, 10, 88);
  context.bezierCurveTo(11, 113, 22, 124, 32, 126);
  context.bezierCurveTo(47, 121, 56, 105, 54, 80);
  context.bezierCurveTo(52, 50, 43, 25, 34, 2);
  context.closePath();
  context.clip();

  const glow = context.createRadialGradient(32, 96, 2, 32, 79, 51);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.3, 'rgba(255,255,255,0.92)');
  glow.addColorStop(0.68, 'rgba(255,255,255,0.58)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createNapalmAssets(time: { value: number }, flame: ReturnType<typeof useFireVolume>, atlas:THREE.Texture) {
  const smoke=createSmokeFoldArt(SMOKE_PARTICLES,time,atlas);
  const airframeGeometry = createPhantomGeometries();
  const airframeMaterials = {
    body: applyPaintedFinish(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }),
      { scale: 1.1, strength: 0.72, edge: 0.56 }),
    dark: applyPaintedFinish(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide }),
      { scale: 1.5, strength: 0.51, edge: 0.5 }),
    glass: applyPaintedFinish(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
      { scale: 1.8, strength: 0.47, edge: 0.42 }),
    lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  const alphabet=createTerminalAlphabet(), faceMap=createLaughingFlameAtlas();
  const geometries = {
    targetBorder:createStrikePerimeter('napalm'),
    target: new THREE.PlaneGeometry(NAPALM_STRIKE_LENGTH, NAPALM_STRIKE_WIDTH),
    bomb: new THREE.CylinderGeometry(0.2, 0.24, 1.55, 10),
    bombNose: new THREE.ConeGeometry(0.2, 0.35, 10),
    bombTail: new THREE.ConeGeometry(0.24, 0.3, 10),
    bombFin: new THREE.BoxGeometry(1, 1, 1),
    smoke: smoke.geometry,
    scorch: new THREE.CircleGeometry(1, 16),
    shockwave: new THREE.RingGeometry(0.78, 1, 48),
    spirit: new THREE.PlaneGeometry(1.25,1.56),
    ember: new THREE.BoxGeometry(1.4, 2.05, 1.4),
  };
  const materials = {
    bomb: new THREE.MeshStandardMaterial({ color: '#39422e', emissive: '#141a10', emissiveIntensity: 0.25,
      metalness: 0.48, roughness: 0.52 }),
    bombEnd: new THREE.MeshStandardMaterial({ color: '#2c3526' }),
    bombFin: new THREE.MeshStandardMaterial({ color: '#31392b' }),
    smoke: smoke.material,
    scorch: createNapalmScorchMaterial(),
    ember: new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  // Animate live marker opacity independently per strike. The private
  // matching materials retain their shared shader variants between sorties.
  const stagingMaterials = {
    target: new THREE.MeshBasicMaterial(TARGET_FINISH),
    border: terminalMarkerInk(alphabet,time,'napalm'),
    shockwave: new THREE.MeshBasicMaterial(SHOCKWAVE_FINISH),
    spirit: laughingFlameMaterial(faceMap,time),
    // The gameplay contact flecks share this plain, opaque, instanced key.
    // Ember is transparent; painted tracers and pooled explosions use colors.
    contact: new THREE.MeshBasicMaterial({ toneMapped: false, depthWrite: false }),
  };
  const owned = [alphabet,faceMap,...Object.values(airframeGeometry), ...Object.values(airframeMaterials),
    ...Object.values(geometries), ...Object.values(materials), ...Object.values(stagingMaterials)];
  return { flame, geometries, materials, alphabet, faceMap, time, airframe: { geometries: airframeGeometry, materials: airframeMaterials },
    stagingMaterials,
    dispose: () => owned.forEach(resource => resource.dispose()) };
}

type NapalmAssets = ReturnType<typeof createNapalmAssets>;

function buildNapalmRenderBatch({ flame, geometries, materials, airframe, stagingMaterials }: NapalmAssets) {
  // Draw a single representative instance with the same geometry, attributes
  // and receive-shadow flag as each live batch. No new scene draw calls persist.
  const identity = new THREE.Matrix4();
  const one = (geometry: THREE.BufferGeometry, material: THREE.Material, receiveShadow = false) => {
    const instance = new THREE.InstancedMesh(geometry, material, 1);
    instance.setMatrixAt(0, identity);
    instance.receiveShadow = receiveShadow;
    return instance;
  };
  const ground = new THREE.Mesh(geometries.target, stagingMaterials.target);
  ground.rotateX(-Math.PI / 2);
  const scorch = one(geometries.scorch, materials.scorch, true);
  scorch.rotateX(-Math.PI / 2);
  return [
    new THREE.Mesh(airframe.geometries.body, airframe.materials.body),
    new THREE.Mesh(airframe.geometries.dark, airframe.materials.dark),
    new THREE.Mesh(airframe.geometries.glass, airframe.materials.glass),
    new THREE.Mesh(airframe.geometries.lights, airframe.materials.lights),
    new THREE.Mesh(geometries.bomb, materials.bomb),
    new THREE.Mesh(geometries.bombNose, materials.bombEnd),
    new THREE.Mesh(geometries.bombFin, materials.bombFin),
    ground, new THREE.Mesh(geometries.targetBorder, stagingMaterials.border),
    new THREE.Mesh(geometries.shockwave, stagingMaterials.shockwave),
    new THREE.Mesh(geometries.spirit, stagingMaterials.spirit),
    scorch, one(flame.geometry, flame.material),
    one(geometries.smoke, materials.smoke), one(geometries.ember, materials.ember),
    one(geometries.ember, stagingMaterials.contact),
  ];
}

/** Four merged batches replace the individual primitive/overlay airframe parts. */
function PhantomAirframe({ geometries, materials }: NapalmAssets['airframe']) {
  return <group>
    <mesh geometry={geometries.body} material={materials.body} castShadow />
    <mesh geometry={geometries.dark} material={materials.dark} castShadow />
    <mesh geometry={geometries.glass} material={materials.glass} />
    <mesh geometry={geometries.lights} material={materials.lights} />
  </group>;
}

interface NapalmStrikeVisualProps {
  strike: NapalmStrike;
  onImpact: (id: number) => void;
  onBurnTick?: (id: number, burnStrength: number) => void;
  onComplete: (id: number) => void;
  lightLevels: Map<number, number>;
  assets: NapalmAssets;
}

function NapalmStrikeVisual({
  strike,
  onImpact,
  onBurnTick,
  onComplete,
  lightLevels,
  assets: { flame, geometries, materials, airframe, alphabet, faceMap, time },
}: NapalmStrikeVisualProps) {
  const strikeGroupRef = useRef<THREE.Group>(null);
  const jetRef = useRef<THREE.Group>(null);
  const bombRef = useRef<THREE.Group>(null);
  const fireGroupRef = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.InstancedMesh>(null);
  const smokeRef = useRef<THREE.InstancedMesh>(null);
  const emberRef = useRef<THREE.InstancedMesh>(null);
  const scorchRef = useRef<THREE.InstancedMesh>(null);
  const targetRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const borderRef = useRef<THREE.Mesh>(null);
  const spiritRef = useRef<THREE.Mesh>(null);
  const markerMaterials=useMemo(()=>({
    border:terminalMarkerInk(alphabet,time,'napalm'), spirit:laughingFlameMaterial(faceMap,time),
  }),[alphabet,faceMap,time]);
  useEffect(()=>()=>{markerMaterials.border.dispose();markerMaterials.spirit.dispose();},[markerMaterials]);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const shockwaveMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const elapsedRef = useRef(0);
  const impactTriggeredRef = useRef(false);
  const nextBurnSampleAtRef = useRef(0);
  const completedRef = useRef(false);
  const flightPathInitializedRef = useRef(false);
  const bombReleasedRef = useRef(false);
  const scorchSettledRef = useRef(false);

  useLayoutEffect(() => () => { lightLevels.delete(strike.id); }, [lightLevels, strike.id]);

  const particleData = useMemo(() => {
    const random = seededRandom(strike.id * 7919 + 104729);
    // Stagger the two sides of the burn lane. Each footprint stays planted
    // while the baked flame cels move through it and peel off at the tips.
    const flamePockets = Array.from({length: FLAME_POCKETS}, (_, index) => {
      const along = (index + .25 + random() * .5) / FLAME_POCKETS;
      const side = index % 2 === 0 ? -1 : 1;
      return {
        x: (along - .5) * NAPALM_STRIKE_LENGTH * .95,
        z: side * (.08 + random() * .20) * NAPALM_STRIKE_WIDTH,
        delay: along * NAPALM_TIMELINE.ignitionSweepSeconds,
        width: 2.5 + random() * 1.1,
        height: 1.8 + random() * 1.8,
        depth: 1.6 + random() * 1.2,
        phase: random() * Math.PI * 2,
      };
    });

    // Stagger five painted folds at each source. Each expands and drifts
    // independently, exposing firelit gaps as the dark upper folds overlap.
    const smokeSources = Array.from({length: SMOKE_SOURCES}, (_, index) => ({
      x: ((index + .3 + random() * .4) / SMOKE_SOURCES - .5) * NAPALM_STRIKE_LENGTH * .94,
      z: (random() - .5) * NAPALM_STRIKE_WIDTH * .58,
      lifetime: 3.8 + random() * .8,
      rise: 5.6 + random() * 1.8,
    }));
    const smokeParticles = Array.from({length: SMOKE_PARTICLES}, (_, index) => {
      const source = smokeSources[index % SMOKE_SOURCES];
      const layer = Math.floor(index / SMOKE_SOURCES);
      return {
        ...source,
        x: source.x + (random() - .5) * .72,
        z: source.z + (random() - .5) * .46,
        delay: smokeFoldDelay(layer, source.lifetime, source.x) + (source.x / NAPALM_STRIKE_LENGTH + .5) * NAPALM_TIMELINE.ignitionSweepSeconds,
        size: .84 + random() * .24, sway: random() * Math.PI * 2,
        driftX: 1.7 + random() * .7, driftZ: .46 + random() * .4,
      };
    });

    const emberParticles: FireParticle[] = Array.from({ length: EMBER_PARTICLE_COUNT }, () => {
      const x = (random() - 0.5) * NAPALM_STRIKE_LENGTH * 0.9;
      const runProgress = (x / NAPALM_STRIKE_LENGTH) + 0.5;
      return {
        x,
        z: (random() - 0.5) * NAPALM_STRIKE_WIDTH * 0.72,
        delay: 0.25 + runProgress * NAPALM_TIMELINE.ignitionSweepSeconds + random() * 1.1,
        phase: random(),
        lifetime: 1.4 + random() * 1.5,
        rise: 2.4 + random() * 3.6,
        size: 0.025 + random() * 0.045,
        sway: random() * Math.PI * 2,
      };
    });

    const scorchPatches: ScorchPatch[] = Array.from({ length: SCORCH_PATCH_COUNT }, () => {
      const x = (random() - 0.5) * NAPALM_STRIKE_LENGTH * 0.96;
      const runProgress = (x / NAPALM_STRIKE_LENGTH) + 0.5;
      return {
        x,
        z: (random() - 0.5) * NAPALM_STRIKE_WIDTH * 0.68,
        delay: runProgress * NAPALM_TIMELINE.ignitionSweepSeconds,
        scaleX: 0.65 + random() * 1.65,
        scaleZ: 0.42 + random() * 1.05,
        rotation: random() * Math.PI,
      };
    });

    const scorchSettlesAt = Math.max(...scorchPatches.map(patch => patch.delay)) + 0.55;
    return { flamePockets, smokeParticles, emberParticles, scorchPatches, scorchSettlesAt };
  }, [strike.id]);

  useLayoutEffect(() => {
    for (const ref of [flameRef, smokeRef, emberRef, scorchRef]) {
      ref.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    for (const ref of [flameRef, smokeRef, emberRef]) {
      const mesh = ref.current;
      if (!mesh) continue;
      for (let i = 0; i < mesh.instanceMatrix.count; i++) writeParticle(mesh, i, 0, 0, 0, 0, 0, 0);
      mesh.count = 0;
    }
    // InstancedMesh caches its first sphere. At ignition that only encloses
    // the first sparks, not the curtain or the subsequent billowing smoke.
    // Bound the complete sweep in strike-local space, including GPU billboards.
    const movingBounds = new THREE.Sphere(new THREE.Vector3(0, 5.5, 0),
      Math.hypot(NAPALM_STRIKE_LENGTH * .5 + 4.5, 8, NAPALM_STRIKE_WIDTH * .5 + 3.5));
    for (const ref of [flameRef, smokeRef, emberRef, scorchRef]) {
      if (ref.current) ref.current.boundingSphere = movingBounds;
    }
  }, []);

  const bombImpactPosition = useMemo(() => new THREE.Vector3(0, 0.18, 0), []);
  const bombReleasePosition = useMemo(() => new THREE.Vector3(), []);
  const flightStart = useMemo(() => new THREE.Vector3(), []);
  const flightPass = useMemo(() => new THREE.Vector3(), []);
  const flightExit = useMemo(() => new THREE.Vector3(), []);
  const flightApproachVelocity = useMemo(() => new THREE.Vector3(), []);
  const flightPassVelocity = useMemo(() => new THREE.Vector3(), []);
  const flightExitVelocity = useMemo(() => new THREE.Vector3(), []);
  const cameraFlightPoint = useMemo(() => new THREE.Vector3(), []);
  const flightDirection = useMemo(() => new THREE.Vector3(), []);
  const jetForward = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ camera, clock }, delta) => {
    if (completedRef.current) return;
    elapsedRef.current = strike.audibleAtMs === undefined ? elapsedRef.current + delta
      : Math.max(0, (performance.now() - strike.audibleAtMs) / 1000);
    const age = elapsedRef.current;

    if (!flightPathInitializedRef.current && strikeGroupRef.current && age >= NAPALM_TIMELINE.jetIngressSeconds) {
      const resolveFlightPoint = (
        cameraX: number,
        cameraY: number,
        cameraZ: number,
        minimumWorldY: number,
        result: THREE.Vector3,
      ) => {
        cameraFlightPoint.set(cameraX, cameraY, cameraZ);
        camera.localToWorld(cameraFlightPoint);
        cameraFlightPoint.y = Math.max(cameraFlightPoint.y, minimumWorldY);
        result.copy(cameraFlightPoint);
        strikeGroupRef.current!.worldToLocal(result);
      };

      // Freeze a readable horizon pass after the camera's gentle cinematic tilt.
      resolveFlightPoint(...NAPALM_FLIGHT_ENVELOPE.ingress, flightStart);
      resolveFlightPoint(...NAPALM_FLIGHT_ENVELOPE.pass, flightPass);
      resolveFlightPoint(...NAPALM_FLIGHT_ENVELOPE.exit, flightExit);

      const approachDuration = NAPALM_TIMELINE.impactSeconds - NAPALM_TIMELINE.jetIngressSeconds;
      const exitDuration = NAPALM_TIMELINE.jetExitSeconds - NAPALM_TIMELINE.impactSeconds;
      flightApproachVelocity.copy(flightPass).sub(flightStart).multiplyScalar(1 / approachDuration);
      flightExitVelocity.copy(flightExit).sub(flightPass).multiplyScalar(1 / exitDuration);

      // Use one physical velocity through the release point so the two authored
      // path sections meet C1-continuously instead of easing the Phantom to a stop.
      const passSpeed = (flightApproachVelocity.length() + flightExitVelocity.length()) * 0.5;
      flightPassVelocity
        .copy(flightApproachVelocity)
        .add(flightExitVelocity)
        .normalize()
        .multiplyScalar(passSpeed);
      flightPathInitializedRef.current = true;
    }

    if (jetRef.current && flightPathInitializedRef.current
      && (age < NAPALM_TIMELINE.jetExitSeconds || jetRef.current.visible)) {
      const approaching = age <= NAPALM_TIMELINE.impactSeconds;
      const approachDuration = NAPALM_TIMELINE.impactSeconds - NAPALM_TIMELINE.jetIngressSeconds;
      const exitDuration = NAPALM_TIMELINE.jetExitSeconds - NAPALM_TIMELINE.impactSeconds;
      const approachProgress = THREE.MathUtils.clamp(
        (age - NAPALM_TIMELINE.jetIngressSeconds)
          / approachDuration,
        0,
        1,
      );
      const exitProgress = THREE.MathUtils.clamp(
        (age - NAPALM_TIMELINE.impactSeconds)
          / exitDuration,
        0,
        1,
      );

      jetRef.current.visible = age >= NAPALM_TIMELINE.jetIngressSeconds
        && age < NAPALM_TIMELINE.jetExitSeconds;

      if (approaching) {
        setHermitePosition(
          jetRef.current.position,
          flightStart,
          flightPass,
          flightApproachVelocity,
          flightPassVelocity,
          approachDuration,
          approachProgress,
        );
        setHermiteDirection(
          flightDirection,
          flightStart,
          flightPass,
          flightApproachVelocity,
          flightPassVelocity,
          approachDuration,
          approachProgress,
        );
      } else {
        setHermitePosition(
          jetRef.current.position,
          flightPass,
          flightExit,
          flightPassVelocity,
          flightExitVelocity,
          exitDuration,
          exitProgress,
        );
        setHermiteDirection(
          flightDirection,
          flightPass,
          flightExit,
          flightPassVelocity,
          flightExitVelocity,
          exitDuration,
          exitProgress,
        );
      }

      const fullFlightProgress = THREE.MathUtils.clamp(
        (age - NAPALM_TIMELINE.jetIngressSeconds)
          / (NAPALM_TIMELINE.jetExitSeconds - NAPALM_TIMELINE.jetIngressSeconds),
        0,
        1,
      );
      jetRef.current.quaternion.setFromUnitVectors(jetForward, flightDirection);
      jetRef.current.rotateX(THREE.MathUtils.lerp(
        -0.1,
        0.14,
        THREE.MathUtils.smoothstep(fullFlightProgress, 0, 1),
      ));

      if (age >= NAPALM_TIMELINE.bombReleaseSeconds && !bombReleasedRef.current) {
        bombReleasedRef.current = true;
        const releaseProgress = THREE.MathUtils.clamp(
          (NAPALM_TIMELINE.bombReleaseSeconds - NAPALM_TIMELINE.jetIngressSeconds)
            / approachDuration,
          0,
          1,
        );
        setHermitePosition(
          bombReleasePosition,
          flightStart,
          flightPass,
          flightApproachVelocity,
          flightPassVelocity,
          approachDuration,
          releaseProgress,
        );
        bombReleasePosition.y -= 0.55;
      }

    }

    if (bombRef.current && (age < NAPALM_TIMELINE.impactSeconds || bombRef.current.visible)) {
      const bombProgress = THREE.MathUtils.clamp(
        (age - NAPALM_TIMELINE.bombReleaseSeconds)
          / (NAPALM_TIMELINE.impactSeconds - NAPALM_TIMELINE.bombReleaseSeconds),
        0,
        1,
      );
      bombRef.current.visible = age >= NAPALM_TIMELINE.bombReleaseSeconds
        && age < NAPALM_TIMELINE.impactSeconds;
      const releasePosition = bombReleasedRef.current ? bombReleasePosition : flightPass;
      bombRef.current.position.lerpVectors(releasePosition, bombImpactPosition, bombProgress);
      bombRef.current.position.y = THREE.MathUtils.lerp(
        releasePosition.y,
        bombImpactPosition.y,
        bombProgress * bombProgress,
      ) + Math.sin(bombProgress * Math.PI) * 0.28;
      bombRef.current.rotation.set(0, 0, -0.08 + bombProgress * 1.7);
    }

    const target = targetRef.current;
    if (target?.visible) {
      const opacity = age < NAPALM_TIMELINE.impactSeconds
        ? 0.085 + Math.sin(age * 7.5) * 0.032
        : Math.max(0, 0.12 - (age - NAPALM_TIMELINE.impactSeconds) * 0.65);
      target.material.opacity = opacity;
      // A zero-alpha plane with no depth writes cannot contribute to the frame.
      // The strike clock only advances; stop submitting it for the rest of the burn.
      if (opacity === 0) target.visible = false;
    }
    const afterImpact=age-NAPALM_TIMELINE.impactSeconds;
    markerMaterials.border.opacity=afterImpact<0?.88:Math.max(0,.88-afterImpact*4.3);
    if(borderRef.current)borderRef.current.visible=markerMaterials.border.opacity>0;
    const spirit=spiritRef.current, group=strikeGroupRef.current;
    if(spirit && group){
      spirit.visible=afterImpact<.30;
      if(spirit.visible){
        const beat=Math.floor(age*12)/12;
        spirit.position.y=1.34+.18*Math.sin(beat*3.8)+.055*Math.abs(Math.sin(beat*8.0));
        spirit.quaternion.copy(group.quaternion).invert().multiply(camera.quaternion);
        const bounce=.055*Math.sin(beat*8.);
        spirit.scale.set(1.-bounce,1.+bounce,1);
        markerMaterials.spirit.opacity=1.-THREE.MathUtils.smoothstep(afterImpact,0,.30);
      }
    }

    if (age >= NAPALM_TIMELINE.impactSeconds && !impactTriggeredRef.current) {
      impactTriggeredRef.current = true;
      onImpact(strike.id);
    }

    const fireAge = age - NAPALM_TIMELINE.impactSeconds;
    if (fireGroupRef.current) fireGroupRef.current.visible = fireAge >= 0;

    if (fireAge >= 0) {
      const totalFireSeconds = NAPALM_TIMELINE.cleanupSeconds - NAPALM_TIMELINE.impactSeconds;
      const burnDown = fireAge <= NAPALM_TIMELINE.rollingFireSeconds
        ? 1
        : 1 - THREE.MathUtils.smoothstep(
          fireAge,
          NAPALM_TIMELINE.rollingFireSeconds,
          totalFireSeconds,
        );
      if (burnDown > 0 && fireAge >= nextBurnSampleAtRef.current) {
        nextBurnSampleAtRef.current = fireAge + NAPALM_HAZARD_SAMPLE_SECONDS;
        onBurnTick?.(strike.id, burnDown);
      }
      const flickerTime = clock.elapsedTime;

      const flames = flameRef.current;
      if (flames) {
        let count = 0;
        for (const pocket of particleData.flamePockets) {
          const ageAtPocket = fireAge - pocket.delay;
          if (ageAtPocket <= 0 || burnDown <= .001) break;
          const growth = THREE.MathUtils.smoothstep(ageAtPocket, 0, .32) * burnDown;
          const flare = 1 + .13 * Math.sin(flickerTime * 3.3 + pocket.phase);
          writeParticle(flames, count++, pocket.x, FLAME_ROOT_Y, pocket.z,
            pocket.width * Math.sqrt(growth), pocket.height * growth * flare, pocket.depth * Math.sqrt(growth));
        }
        flames.count = count;
        if (count) flames.instanceMatrix.needsUpdate = true;
      }

      const smoke = smokeRef.current;
      if (smoke) {
        let count = 0;
        particleData.smokeParticles.forEach((particle, index) => {
          const localAge = fireAge - particle.delay;
          if (localAge < 0 || burnDown <= 0) return;
          writeSmokeFold(smoke, index, particle, localAge, flickerTime, Math.sqrt(burnDown));
          count = index + 1;
        });
        smoke.count = count;
        if (count) smoke.instanceMatrix.needsUpdate = true;
      }

      const embers = emberRef.current;
      if (embers) {
        let count = 0;
        particleData.emberParticles.forEach((particle, index) => {
          const localAge = fireAge - particle.delay;
          if (localAge < 0 || burnDown <= 0) return;
          count = index + 1;
          const cycleAge = (localAge + particle.phase * particle.lifetime) % particle.lifetime;
          const life = cycleAge / particle.lifetime;
          const emberScale = particle.size * (1 - life) * burnDown;
          writeParticle(embers, index,
            particle.x + Math.sin(flickerTime * 2.1 + particle.sway) * life * 0.8,
            0.35 + life * particle.rise,
            particle.z + Math.cos(flickerTime * 1.7 + particle.sway) * life * 0.48,
            emberScale, emberScale, emberScale,
          );
        });
        embers.count = count;
        if (count) embers.instanceMatrix.needsUpdate = true;
      }

      if (scorchRef.current && !scorchSettledRef.current) {
        particleData.scorchPatches.forEach((patch, index) => {
          const growth = THREE.MathUtils.smoothstep(fireAge - patch.delay, 0, 0.55);
          dummy.position.set(patch.x, 0.045 + index * 0.0004, patch.z);
          dummy.rotation.set(-Math.PI / 2, 0, patch.rotation);
          dummy.scale.set(patch.scaleX * growth, patch.scaleZ * growth, 1);
          dummy.updateMatrix();
          scorchRef.current?.setMatrixAt(index, dummy.matrix);
        });
        scorchRef.current.instanceMatrix.needsUpdate = true;
        // The ground marks no longer change after their initial ignition sweep.
        // Keep their final matrices without recomputing or uploading every frame.
        scorchSettledRef.current = fireAge >= particleData.scorchSettlesAt;
      }

      const shockwaveProgress = THREE.MathUtils.clamp(fireAge / 0.9, 0, 1);
      if (shockwaveRef.current) {
        shockwaveRef.current.visible = shockwaveProgress < 1;
        shockwaveRef.current.scale.setScalar(1 + shockwaveProgress * 3.8);
      }
      if (shockwaveMaterialRef.current) {
        shockwaveMaterialRef.current.opacity = Math.pow(1 - shockwaveProgress, 2) * 0.52;
      }

      const attack = THREE.MathUtils.smoothstep(fireAge, 0, 0.12);
      const lightDecay = 1 - THREE.MathUtils.smoothstep(fireAge, 2.5, totalFireSeconds);
      lightLevels.set(strike.id, attack * lightDecay * (4.7 + Math.sin(flickerTime * 17) * 0.8));
    }

    if (age >= NAPALM_TIMELINE.cleanupSeconds && !completedRef.current) {
      completedRef.current = true;
      onComplete(strike.id);
    }
  });

  return (
    <group ref={strikeGroupRef} position={strike.position} rotation={[0, strike.rotation, 0]}>
      <mesh ref={targetRef} geometry={geometries.target} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <meshBasicMaterial {...TARGET_FINISH} />
      </mesh>
      <mesh name="napalm-code-perimeter" ref={borderRef} geometry={geometries.targetBorder} material={markerMaterials.border}
        rotation={[-Math.PI/2,0,0]} position={[0,.055,0]} />
      {/* Airframe-only change: existing +X-forward path and world scale stay fixed. */}
      <group ref={jetRef} name="napalm-phantom" visible={false} scale={0.52}>
        <PhantomAirframe {...airframe} />
      </group>

      <group ref={bombRef} visible={false} scale={0.38}>
        <mesh geometry={geometries.bomb} material={materials.bomb} rotation={[0, 0, Math.PI / 2]} castShadow />
        <mesh geometry={geometries.bombNose} material={materials.bombEnd}
          position={[0.9, 0, 0]} rotation={[0, 0, -Math.PI / 2]} />
        <mesh geometry={geometries.bombTail} material={materials.bombEnd}
          position={[-0.88, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
        {[-0.2, 0.2].map(z => (
          <mesh key={z} geometry={geometries.bombFin} material={materials.bombFin}
            position={[-0.72, 0, z]} scale={[0.48, 0.04, 0.18]} />
        ))}
      </group>

      <group ref={fireGroupRef} visible={false}>
        {/* Geometry and non-varying materials belong to the session, while
            each mesh still owns its instance buffer and animated opacity. */}
        <instancedMesh ref={scorchRef} args={[geometries.scorch, materials.scorch, SCORCH_PATCH_COUNT]} receiveShadow />

        <mesh ref={shockwaveRef} geometry={geometries.shockwave} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <meshBasicMaterial ref={shockwaveMaterialRef} {...SHOCKWAVE_FINISH} />
        </mesh>

        <instancedMesh name="napalm-ground-flames" ref={flameRef} args={[flame.geometry, flame.material, FLAME_POCKETS]} renderOrder={55} />
        <instancedMesh name="napalm-cel-smoke" ref={smokeRef} args={[geometries.smoke, materials.smoke, SMOKE_PARTICLES]} renderOrder={58} />
        <instancedMesh ref={emberRef} args={[geometries.ember, materials.ember, EMBER_PARTICLE_COUNT]} renderOrder={57} />
      </group>
      <mesh name="napalm-laughing-flame" ref={spiritRef} geometry={geometries.spirit}
        material={markerMaterials.spirit} position-y={1.34} />
    </group>
  );
}

// A normal strike expires before the next one can ignite. In a stalled or
// backgrounded session two visual clocks may still overlap; choose the
// strongest active cue deterministically rather than allocating more lights.
export function selectNapalmLightCue(strikes: readonly NapalmStrike[], levels: ReadonlyMap<number, number>) {
  let intensity = 0;
  let selected: NapalmStrike | undefined;
  for (const strike of strikes) {
    const next = levels.get(strike.id) ?? 0;
    if (next > intensity) {
      intensity = next;
      selected = strike;
    }
  }
  return selected;
}

interface OrdnanceEffectsProps {
  napalmStrikes: NapalmStrike[];
  onNapalmImpact: (id: number) => void;
  onNapalmBurnTick?: (id: number, burnStrength: number) => void;
  onNapalmComplete: (id: number) => void;
}

export function OrdnanceEffects({
  napalmStrikes,
  onNapalmImpact,
  onNapalmBurnTick,
  onNapalmComplete,
}: OrdnanceEffectsProps) {
  const fireLight = useRef<THREE.PointLight>(null);
  const lightLevels = useMemo(() => new Map<number, number>(), []);
  // Keep shader programs alive between call-ins. R3F disposes per-strike
  // instance buffers with each mesh; these shared arguments live until exit.
  const time = useMemo(() => ({ value: 0 }), []);
  const flame = useFireVolume('flame');
  const atlas=useLoader(THREE.TextureLoader,CHARCOAL_TEXTURE);
  const assets = useMemo(() => createNapalmAssets(time, flame,atlas), [time, flame,atlas]);
  useEffect(() => () => assets.dispose(), [assets]);
  const prepared = useRef<typeof assets | null>(null);
  // A normal world draw (composer or raw renderer) must create the live sun's
  // PCF depth texture first. The scratch pass then borrows it on the next frame.
  useFrame(({ gl, scene, camera }) => {
    if (prepared.current === assets || !fireLight.current || !gl || !('isWebGLRenderer' in gl) || !gl.isWebGLRenderer
        || gl.xr.isPresenting || gl.getContext().isContextLost() || !napalmShadowMapsReady(gl, scene, camera)) return;
    prepared.current = assets;
    try {
      prepareNapalmRender(gl, scene, camera, [
        ...buildNapalmRenderBatch(assets), ...armedFileRenderBatch(scene), ...flyoverRenderBatch(scene), ...relayInkRenderBatch(scene),
      ]);
    } catch (error) {
      // The offscreen pass is optional; never lose the sector to it.
      console.warn('Napalm GPU preparation skipped', error);
    }
  });
  // Resolve after each strike samples its own effect clock, before composer
  // rendering. Keep a visible light object even when intensity is zero:
  // Three specializes every lit shader by the number of visible point lights.
  useFrame(({ clock }) => {
    time.value = clock.elapsedTime;
    flame.material.uniforms.time.value = clock.elapsedTime;
    const light = fireLight.current;
    if (!light) return;
    const strike = selectNapalmLightCue(napalmStrikes, lightLevels);
    light.intensity = strike ? lightLevels.get(strike.id)! : 0;
    if (strike) light.position.set(strike.position[0], strike.position[1] + 3.1, strike.position[2]);
  }, .25);
  return (
    <>
      <pointLight ref={fireLight} name="napalm-ground-light" color="#ff6a24" intensity={0} distance={24} decay={2} />
      {napalmStrikes.map(strike => (
        <NapalmStrikeVisual
          key={strike.id}
          strike={strike}
          onImpact={onNapalmImpact}
          onBurnTick={onNapalmBurnTick}
          onComplete={onNapalmComplete}
          lightLevels={lightLevels}
          assets={assets}
        />
      ))}
    </>
  );
}
