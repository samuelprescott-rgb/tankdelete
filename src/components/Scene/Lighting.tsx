export const NIGHTMARE_LIGHTING = Object.freeze({
  ambientIntensity: 0.18,
  hemisphereIntensity: 0.38,
  keyIntensity: 0.72,
  coolFillIntensity: 0.18,
  neutralFillIntensity: 0.12,
  warmFillIntensity: 0.08,
  practicalIntensity: 0.12,
});

interface LightingProps {
  nightmareActive?: boolean;
}

export function Lighting({ nightmareActive = false }: LightingProps) {
  const mix = nightmareActive
    ? NIGHTMARE_LIGHTING
    : {
        ambientIntensity: 0.38,
        hemisphereIntensity: 0.78,
        keyIntensity: 1.28,
        coolFillIntensity: 0.42,
        neutralFillIntensity: 0.29,
        warmFillIntensity: 0.22,
        practicalIntensity: 0.28,
      };

  return (
    <>
      <ambientLight
        intensity={mix.ambientIntensity}
        color={nightmareActive ? '#687b72' : '#96aa9a'}
      />
      <hemisphereLight
        args={nightmareActive
          ? ['#73817c', '#111710', mix.hemisphereIntensity]
          : ['#aebeb4', '#26351f', mix.hemisphereIntensity]}
      />
      <directionalLight
        castShadow
        position={[-28, 38, 14]}
        intensity={mix.keyIntensity}
        color={nightmareActive ? '#9ba6a0' : '#d5d8c5'}
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
      <directionalLight
        position={[20, 18, -26]}
        intensity={mix.coolFillIntensity}
        color={nightmareActive ? '#658078' : '#8fb4aa'}
      />
      <directionalLight
        position={[-12, 16, -6]}
        intensity={mix.neutralFillIntensity}
        color={nightmareActive ? '#87948c' : '#b7c7af'}
      />
      <directionalLight
        position={[8, 10, 30]}
        intensity={mix.warmFillIntensity}
        color={nightmareActive ? '#827b68' : '#c6b38a'}
      />
      <pointLight
        position={[0, 15, -8]}
        intensity={mix.practicalIntensity}
        color={nightmareActive ? '#81765f' : '#c8b684'}
        distance={68}
      />
    </>
  );
}
