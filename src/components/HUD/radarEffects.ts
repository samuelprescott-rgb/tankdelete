// Pixel adaptations of PixelFX's Scanner and ASCII Magic Art's World Map Pings.
// Upstream notices ship in public/radar-effects-LICENSE.txt.
const TAU = 2 * Math.PI;
const SWEEP_SPEED = 2; // radians per second, clockwise from twelve o'clock
const ECHO_SECONDS = 0.65;
const ringOffsets = Array.from({ length: 24 }, (_, i) => ({
  x: Math.cos(i * TAU / 24),
  y: Math.sin(i * TAU / 24),
}));

export function sweepAngleAt(time: number) {
  return (time * SWEEP_SPEED) % TAU;
}

export function drawRadarSweep(ctx: CanvasRenderingContext2D, center: number, radius: number, angle: number) {
  // Three discrete phosphor trails. Stamp on the scope's pixel grid so the
  // leading edge keeps its staircase silhouette as it rotates.
  const shades = ['#262d1a', '#393c20', '#716039'];
  for (let trail = 0; trail < shades.length; trail++) {
    const direction = angle - (2 - trail) * 0.055;
    const dx = Math.sin(direction);
    const dy = -Math.cos(direction);
    ctx.fillStyle = shades[trail];
    for (let r = 5; r < radius - 1; r += 2) {
      ctx.fillRect(Math.round(center + dx * r), Math.round(center + dy * r), 2, 2);
    }
  }
}

export function drawRadarEcho(ctx: CanvasRenderingContext2D, x: number, y: number, center: number, radius: number, sweep: number) {
  const bearing = Math.atan2(x - center, center - y);
  const age = ((sweep - bearing + TAU) % TAU) / SWEEP_SPEED;
  if (age >= ECHO_SECONDS) return;

  const phase = Math.floor(age / ECHO_SECONDS * 5);
  const ring = 5 + phase;
  ctx.fillStyle = phase < 2 ? '#e3a36a' : phase < 4 ? '#98623f' : '#69472e';
  // The original arrival ring samples 24 positions on a character grid.
  // Thin out late samples to dissolve the echo without softening its pixels.
  for (let i = 0; i < ringOffsets.length; i += phase < 3 ? 1 : 2) {
    const px = Math.round(x + ringOffsets[i].x * ring);
    const py = Math.round(y + ringOffsets[i].y * ring);
    if ((px - center) ** 2 + (py - center) ** 2 < (radius - 1) ** 2) ctx.fillRect(px, py, 1, 1);
  }
}

export function drawTunnelLock(ctx: CanvasRenderingContext2D, x: number, y: number, age: number) {
  const progress = Math.min(1, Math.max(0, age / 0.32));
  const extent = 5 + Math.round(5 * (1 - progress) ** 3);
  const cx = Math.round(x);
  const cy = Math.round(y);
  // Scanner's inward-facing L brackets, with a hot phosphor pixel at each corner.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const bx = cx + sx * extent;
      const by = cy + sy * extent;
      ctx.fillStyle = '#dc9b51';
      ctx.fillRect(bx - (sx > 0 ? 3 : 0), by, 4, 1);
      ctx.fillRect(bx, by - (sy > 0 ? 3 : 0), 1, 4);
      ctx.fillStyle = '#ffe2a0';
      ctx.fillRect(bx, by, 1, 1);
    }
  }
  ctx.fillStyle = '#ffe2a0';
  ctx.fillRect(cx - 1, cy - 1, 3, 3);
}
