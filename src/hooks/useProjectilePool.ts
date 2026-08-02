import { useRef } from 'react';
import * as THREE from 'three';

export interface Projectile {
  active: boolean;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  lifetime: number;
  kind: 'cannon' | 'machinegun';
  triggerId: number;
}

const MAX_POOL_SIZE = 48;

export function useProjectilePool() {
  // Use ref for pool — mutations happen every frame, don't trigger React re-renders
  const poolRef = useRef<Projectile[]>([]);

  const spawn = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    kind: Projectile['kind'] = 'cannon',
    triggerId = 0,
  ) => {
    const pool = poolRef.current;

    // Find first inactive projectile
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        pool[i].active = true;
        pool[i].position.copy(position);
        pool[i].direction.copy(direction).normalize();
        pool[i].lifetime = 0;
        pool[i].kind = kind;
        pool[i].triggerId = triggerId;
        return;
      }
    }

    // No inactive projectile found, create new one if under max
    if (pool.length < MAX_POOL_SIZE) {
      pool.push({
        active: true,
        position: position.clone(),
        direction: direction.clone().normalize(),
        lifetime: 0,
        kind,
        triggerId,
      });
    }
    // If at max, silently ignore (player firing too fast)
  };

  const despawn = (index: number) => {
    const pool = poolRef.current;
    if (index >= 0 && index < pool.length) {
      pool[index].active = false;
    }
  };

  const getActive = (): { projectile: Projectile; index: number }[] => {
    const pool = poolRef.current;
    const active: { projectile: Projectile; index: number }[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].active) {
        active.push({ projectile: pool[i], index: i });
      }
    }
    return active;
  };

  return {
    spawn,
    despawn,
    pool: poolRef,
    getActive,
  };
}
