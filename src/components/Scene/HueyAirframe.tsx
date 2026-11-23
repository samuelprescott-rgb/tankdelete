import {useEffect, useMemo, type RefObject} from 'react';
import * as THREE from 'three';
import {HUEY_ANCHORS} from './hueyGeometry';
import {createHueyResources} from './flyoverResources';

interface HueyAirframeProps {
  mainRotorRef?: RefObject<THREE.Group | null>;
  tailRotorRef?: RefObject<THREE.Group | null>;
  wrecked?: boolean;
}

export function useOwnedHuey(wrecked: boolean, distant: boolean) {
  const bundle = useMemo(() => createHueyResources(wrecked, distant), [wrecked, distant]);
  useEffect(() => bundle.retain(), [bundle]);
  return bundle;
}

export type HueyAssets = ReturnType<typeof createHueyResources>['assets'];
export function HueyMeshes({ mainRotorRef, tailRotorRef, wrecked = false, distant = false, assets }:
  HueyAirframeProps & { distant?: boolean; assets: HueyAssets }) {
  return (
    <group dispose={null} name={wrecked ? 'huey-wreck-airframe' : 'huey-flying-airframe'}>
      <mesh name="huey-body" geometry={assets.body} material={assets.paint} castShadow={!distant} receiveShadow={!distant} />
      <mesh name="huey-trim" geometry={assets.dark} material={assets.trim} castShadow={!distant} receiveShadow={!distant} />
      <mesh name="huey-glazing" geometry={assets.glass} material={assets.glazing} />
      <group ref={mainRotorRef} position={HUEY_ANCHORS.mainRotor} rotation={wrecked ? [0, 0.44, 0.08] : [0, 0, 0]}>
        <mesh name="huey-main-rotor" geometry={assets.mainRotor} material={assets.rotorPaint} castShadow={!distant} />
      </group>
      <group ref={tailRotorRef} position={HUEY_ANCHORS.tailRotor}>
        <mesh name="huey-tail-rotor" geometry={assets.tailRotor} material={assets.rotorPaint} />
      </group>
    </group>
  );
}

/** The wreck retains its distinct scorched materials and closeup geometry. */
export function HueyAirframe(props: HueyAirframeProps & { distant?: boolean }) {
  const { assets } = useOwnedHuey(props.wrecked ?? false, props.distant ?? false);
  return <HueyMeshes {...props} assets={assets} />;
}
