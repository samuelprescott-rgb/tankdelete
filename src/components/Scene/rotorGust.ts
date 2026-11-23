import {createContext} from 'react';
import type {Vector4} from 'three';

// World X/Z, strength, and the active flight's stepped animation clock.
export const RotorGust = createContext<{value: Vector4} | null>(null);
