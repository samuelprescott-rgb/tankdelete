import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}
const { createDriveKeys, DRIVE_ENVELOPE, PIVOT_ENVELOPE, stepDriveAxis, stepTurretYaw } = await load('../src/lib/tankDrive.ts');
const { TANK_SPEED, TANK_ROTATION_SPEED } = await load('../src/lib/constants.ts');
function close(actual, expected, description) {
  assert.ok(Math.abs(actual - expected) < 1e-9, description + ': ' + actual + ' vs ' + expected);
}
for (const hz of [30, 60, 120]) {
  let yaw = 0;
  for(let i=0;i<hz/2;i++)yaw=stepTurretYaw(yaw,-Math.PI,1/hz);
  close(yaw,-Math.PI/2,'Half-turn visibly passes broadside at 500ms');
  for(let i=0;i<=hz/2;i++)yaw=stepTurretYaw(yaw,-Math.PI,1/hz);
  close(yaw,-Math.PI,'One-second half-turn does not overshoot');
}
close(stepTurretYaw(Math.PI-.01,-Math.PI+.01,1/60),Math.PI+.01,'Short path through yaw seam');
close(stepTurretYaw(0,2,8),Math.PI*.10,'Stalled frame cannot instantly teleport the turret');
close(stepTurretYaw(0,2,NaN),0,'Invalid frame ignored');
function simulate(rate, input, seconds, frames, envelope) {
  let travel = 0, remaining = seconds, frame = 0;
  while (remaining > 1e-12) {
    const dt = Math.min(remaining, frames[frame++ % frames.length]);
    const step = stepDriveAxis(rate, input, dt, envelope);
    assert.ok(Math.abs(step.rate) <= 1 + 1e-12, 'No speed overshoot');
    rate = step.rate;
    travel += step.travel;
    remaining -= dt;
  }
  return { rate, travel };
}
assert.equal(TANK_SPEED, 8);
assert.equal(TANK_ROTATION_SPEED, 2.5);
assert.deepEqual(DRIVE_ENVELOPE,{rise:.720,release:.320,reverseBrake:.180});
for (const frames of [[1/15], [1/30], [1/60], [1/120], [1/144], [.011, .083, .25, .016, .061], [.25]]) {
  for (const sign of [-1, 1]) {
    const first = simulate(0, sign, .100, frames, DRIVE_ENVELOPE);
    close(first.rate * 8, sign * 10/9, 'Speed at 100 ms');
    close(first.travel * 8, sign / 18, 'Distance at 100 ms');
    const opening=simulate(0,sign,1/120,frames,DRIVE_ENVELOPE);
    close(opening.rate*8,sign*5/54,'Input already changes speed on the first 120Hz frame');
    assert.ok(opening.travel*sign>0,'No pullaway dead zone');
    const second = simulate(0, sign, 1, frames, DRIVE_ENVELOPE);
    close(second.rate, sign, 'Cruising at full speed');
    close(second.travel * 8, sign * 5.12, 'First second of travel');
    close(simulate(0, sign, .720, frames, DRIVE_ENVELOPE).rate, sign, 'Full at 720 ms');
    close(simulate(0, sign, .648, frames, DRIVE_ENVELOPE).rate*8,sign*7.2,'Matches boss pursuit speed by 648ms');
    close(simulate(sign,sign,1,frames,DRIVE_ENVELOPE).travel*8,sign*8,'Cruise ceiling remains available for boss escape');
    const halfStop=simulate(sign,0,.160,frames,DRIVE_ENVELOPE);
    close(halfStop.rate,sign*.5,'Release still carries half momentum at 160ms');
    close(halfStop.travel*8,sign*.96,'Measured first-half coasting distance');
    const stop = simulate(sign, 0, .320, frames, DRIVE_ENVELOPE);
    close(stop.rate, 0, 'Release stops in 320 ms');
    close(stop.travel * 8, sign * 1.28, 'Release distance limit');
    close(simulate(sign, 0, 2, frames, DRIVE_ENVELOPE).travel * 8, sign * 1.28, 'No idle creep');
    const zero = simulate(sign, -sign, .180, frames, DRIVE_ENVELOPE);
    close(zero.rate, 0, 'Opposite input crosses zero at 180 ms');
    close(zero.travel * 8, sign * .72, 'Reversal forward excursion');
    const reversed = simulate(sign, -sign, .900, frames, DRIVE_ENVELOPE);
    close(reversed.rate, -sign, 'Full reverse at 900 ms');
    close(reversed.travel * 8, -sign * 2.16, 'Reversal integrates both directions');

    close(simulate(0, sign, .070, frames, PIVOT_ENVELOPE).rate, sign * .5, 'Half yaw rate at 70 ms');
    close(simulate(0, sign, .140, frames, PIVOT_ENVELOPE).rate, sign, 'Full pivot at 140 ms');
    const pivotStop = simulate(sign, 0, .042, frames, PIVOT_ENVELOPE);
    close(pivotStop.rate, 0, 'Pivot release stops in 42 ms');
    close(pivotStop.travel * 2.5, sign * .0525, 'Pivot overshoot <= 3.01 degrees');
    close(simulate(sign, -sign, .200, frames, PIVOT_ENVELOPE).rate, -sign, 'Full counterpivot at 200 ms');
  }
}
for (const dt of [NaN, Infinity, -1, 0]) {
  assert.deepEqual(stepDriveAxis(.4, -1, dt, DRIVE_ENVELOPE), { rate: .4, travel: 0 });
}
close(stepDriveAxis(1, 1, 10, DRIVE_ENVELOPE).travel, .25, 'Long frame capped at 2 dry units');
const keys = createDriveKeys();
for (const [code, action] of [['KeyW','forward'],['ArrowUp','forward'],['KeyS','backward'],['ArrowDown','backward'],
  ['KeyA','left'],['ArrowLeft','left'],['KeyD','right'],['ArrowRight','right']]) {
  keys.press(code, false); assert.equal(keys[action], true);
  keys.release(code); assert.equal(keys[action], false);
}
keys.press('KeyW', false); keys.press('ArrowUp', false); keys.release('KeyW');
assert.equal(keys.forward, true, 'Releasing an alias cannot cancel the other held binding');
keys.press('KeyS', false);
assert.equal(Number(keys.forward) - Number(keys.backward), 0, 'Opposing keys brake, not reverse');
keys.clear(); keys.press('KeyS', true); keys.press('KeyD', false);
assert.ok(!keys.forward && !keys.backward && keys.right, 'Fresh input independent of stale held repeats after reset');
console.log('Tank drive passed: 15/30/60/120/144 Hz + jitter + 250 ms frames; first-frame response, 720ms to 8, 320ms / 1.28 units to stop, 180ms to zero / 900ms to full reverse; unchanged pivot 140/42ms.');
