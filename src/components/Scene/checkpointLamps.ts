// The poles, bulb lenses, light pools and illuminated rain share these anchors.
export const CHECKPOINT_LAMPS = [
  { pole: [-7.1, 5.1, 1.9], side: -1, aim: [-6.6, 0, -.8], intensity: 215 },
  { pole: [8.3, 4.35, 5.5], side: 1, aim: [7.7, 0, 3.6], intensity: 110 },
] as const;

// A long-throw flood on the east crossarm. Its axis crosses the entry lane
// at chest height, with dark ground on both sides of the pool.
const eastPost = CHECKPOINT_LAMPS[1].pole;
export const CHECKPOINT_FLOOD = {
  position: [eastPost[0] - .62, eastPost[1] - .47, eastPost[2] - .18],
  aim: [-6.0, 1.05, 2.85],
  angle: .21, penumbra: .56, range: 26, intensity: 1850, color: '#ffad43',
  shutterSlope: .34, shutterHalfHeight: .46, shutterFeather: .45,
} as const;

export function checkpointBulb({ pole, side }: typeof CHECKPOINT_LAMPS[number]): [number, number, number] {
  return [pole[0] + .48 * side, pole[1] - .98, pole[2] - .065];
}
