# Tank drive response

The hull starts moving on the first simulation frame. It takes a short interval
to reach cruising speed, then brakes quickly enough to park near a target.
The turret still aims directly at the pointer's ground-plane intersection;
there is no smoothing on the reticle, recoil socket or shot direction.

| Dry, unblocked ground | Previous direct-input drive | Eased drive |
| --- | ---: | ---: |
| Hold W from rest for 100 ms | 0.80 units traveled | 0.167 units traveled; now 3.33 units/s |
| Time to 8 units/s | Immediate | 240 ms |
| Hold W from rest for 1 s | 8.00 units | 7.04 units |
| Release W at top speed | Stops immediately | Stops in 55 ms, 0.22 units later |
| Switch W → S at top speed | Immediately at −8 units/s | Zero at 80 ms (+0.32 units); −8 units/s at 320 ms |
| Pivot from rest | Immediately at 2.5 rad/s | Reaches 2.5 rad/s in 140 ms |
| Release a full-speed pivot | Stops immediately | Stops in 42 ms; 0.0525 rad (3.01°) remaining |
| Full left → full right | Immediately at opposite rate | 60 ms to zero; full opposite rate at 200 ms |

Baseline values come from the previous direct speed × frame-time expression.
Candidate values are verified against the production drive function and, for
start/stop/pivot, against the actual mounted tank transform. These are
simulation-time measurements beginning at the first sampled input; they are
not wall-clock keyboard latency or evidence of a smooth frame rate.

Opposite keys brake to a stop. W/S and the up/down arrows are equivalent,
as are A/D and the left/right arrows. Blur, backgrounding, a disabled tank,
or an authoritative reposition clears inputs and stored rates. A genuinely
new press is required afterward; an OS key repeat cannot restart the tank.
Drive resolves before tread, wake and minimap sampling. Track motion and
audio follow actual resolved travel, including a pivot; the wake follows
translation in water. No per-frame React state is added.

The 250 ms hitch cap, 0.28-unit translation and 0.08-radian yaw collision
substeps, terrain and arena checks remain in effect. Scenery props remain
pass-through. At full river immersion the old multipliers still apply:
0.58 for movement (4.64 units/s cruise), 0.72 for yaw (1.8 rad/s).

## Verification

Run `npm run check:tank-drive`. The first suite tests 15, 30, 60, 120 and
144 Hz, irregular deltas, quarter-second frames, mirrored reverse/pivot,
long idle, invalid time deltas and independent key rearming. The second
mounts the actual tank, gear and wake using an in-memory renderer, dispatches
key events, and checks numerical transforms, audio edges, a prop crossing,
an authored mound, the perimeter, river drag and short-teleport reset.
`check:combat-presentation` independently checks real muzzle transforms
through rotation and recoil. `check:river` checks shared river geometry
and immersion; the no-emit TypeScript check also passes.

For the separate [quality gauntlet](tank-game-gauntlet.md), compare the built
game's normal-input start, release, reversal, pivot, orbit/reposition and
aim/fire sequence against the baseline. Passing the numerical suite does
not by itself establish the visual feel or target readability.
