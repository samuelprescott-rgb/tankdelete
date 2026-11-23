// A high reaching hand and low dragging hand leave a moving wedge of sky or
// ground between the sleeve and ribs. The runner instead pumps a tighter pair
// of arms against a deeper lean. These are local presentation rotations only.
export function createUndeadUpperPose() {
  return { roll: 0, pitch: 0, neckTilt: 0, neckRoll: 0,
    lx: 0, ly: 0, lz: 0, rx: 0, ry: 0, rz: 0 };
}

export function writeUndeadUpperPose(
  pose: ReturnType<typeof createUndeadUpperPose>, variant: number, runner: boolean,
  gait: number, stride: number,
) {
  const reachLeft = variant !== 1 || runner;
  const side = reachLeft ? -1 : 1;
  pose.roll = -side * (runner ? .09 : .15) + gait * .045;
  pose.pitch = (runner ? -.42 : -.30) + gait * .045;
  pose.neckTilt = (runner ? -.11 : -.20) - gait * .045;
  pose.neckRoll = pose.roll * 1.5;
  // The sleeve itself already bends forward at the elbow: rotate it outward
  // as well as forward, or the chase view foreshortens the reach into the coat.
  const reach = (runner ? 1.04 : .80) + stride * (runner ? .79 : .34);
  const drag = (runner ? -.22 : -.34) - stride * (runner ? .94 : .52);
  const spread = runner ? .23 : .39;
  pose.lx = reachLeft ? reach : drag;
  pose.ly = reachLeft ? spread : .04;
  pose.lz = reachLeft ? -.31 : -.20;
  pose.rx = reachLeft ? drag : reach;
  pose.ry = reachLeft ? -.04 : -spread;
  pose.rz = reachLeft ? .20 : .31;
}
