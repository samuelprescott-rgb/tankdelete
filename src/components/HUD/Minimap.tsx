import { useRef, useEffect } from 'react';

interface MinimapProps {
  tankStateRef: React.RefObject<{ position: [number, number, number]; rotation: number }>;
  fileBlocks: Array<{
    position: [number, number, number];
    color: string;
    isMarked?: boolean;
    isObjective?: boolean;
  }>;
  folderPortals: Array<{ position: [number, number, number] }>;
  backPortalPosition: [number, number, number] | null;
  enemies: Array<{ position: [number, number, number] }>;
  friendlies?: ReadonlyArray<{ position: [number, number, number] }>;
}

export function Minimap({
  tankStateRef,
  fileBlocks,
  folderPortals,
  backPortalPosition,
  enemies,
  friendlies = [],
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const CANVAS_SIZE = 160;
    const RADAR_RADIUS = 70; // pixels on canvas
    const WORLD_RADIUS = 30; // units in 3D world space
    const SCALE = RADAR_RADIUS / WORLD_RADIUS;

    // Draw the minimap
    function draw() {
      if (!ctx || !canvas || !tankStateRef.current) return;

      const tankPosition = tankStateRef.current.position;
      const tankRotation = tankStateRef.current.rotation;

      const centerX = CANVAS_SIZE / 2;
      const centerY = CANVAS_SIZE / 2;

      // Clear canvas
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Draw dark circular background
      ctx.fillStyle = 'rgba(9, 14, 7, 0.9)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, RADAR_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Draw faint concentric ring guides
      ctx.strokeStyle = 'rgba(135, 155, 99, 0.22)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const radius = (RADAR_RADIUS / 3) * i;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw rotating sweep line (classic radar effect)
      const time = Date.now() / 1000;
      const sweepAngle = (time * 2) % (Math.PI * 2);
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(sweepAngle);
      ctx.strokeStyle = 'rgba(227, 179, 65, 0.24)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -RADAR_RADIUS);
      ctx.stroke();
      ctx.restore();

      // Helper function to rotate point relative to tank
      function rotateAndScale(
        worldX: number,
        worldZ: number,
        clampToEdge = false,
      ): { x: number; y: number; clamped: boolean } | null {
        // Calculate relative position from tank
        const relX = worldX - tankPosition[0];
        const relZ = worldZ - tankPosition[2];

        // Check if within radar range
        const distance = Math.sqrt(relX * relX + relZ * relZ);
        if (distance > WORLD_RADIUS && !clampToEdge) return null;

        // Rotate by negative tank rotation (so forward is always up on minimap)
        const cos = Math.cos(-tankRotation);
        const sin = Math.sin(-tankRotation);
        const rotX = relX * cos - relZ * sin;
        const rotZ = relX * sin + relZ * cos;

        // Scale to canvas coordinates (note: Z maps to Y in 2D)
        const contactScale = distance > WORLD_RADIUS
          ? (RADAR_RADIUS - 7) / Math.max(distance, 0.0001)
          : SCALE;
        return {
          x: centerX + rotX * contactScale,
          y: centerY + rotZ * contactScale,
          clamped: distance > WORLD_RADIUS,
        };
      }

      // Draw file blocks as colored dots
      for (const block of fileBlocks) {
        const pos = rotateAndScale(block.position[0], block.position[2], block.isObjective);
        if (!pos) continue;

        ctx.fillStyle = block.isMarked ? '#e36d32' : block.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Objective huts stay legible from the insertion point even when the
        // compound lies beyond the normal 30 m radar sweep.
        if (block.isObjective) {
          ctx.strokeStyle = pos.clamped ? '#ffcc58' : '#e3b341';
          ctx.lineWidth = pos.clamped ? 2 : 1.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pos.clamped ? 5.5 : 5, 0, Math.PI * 2);
          ctx.stroke();
          if (pos.clamped) {
            const angle = Math.atan2(pos.y - centerY, pos.x - centerX);
            ctx.fillStyle = '#ffcc58';
            ctx.beginPath();
            ctx.moveTo(pos.x + Math.cos(angle) * 6, pos.y + Math.sin(angle) * 6);
            ctx.lineTo(pos.x + Math.cos(angle + 2.45) * 4, pos.y + Math.sin(angle + 2.45) * 4);
            ctx.lineTo(pos.x + Math.cos(angle - 2.45) * 4, pos.y + Math.sin(angle - 2.45) * 4);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Draw folder portals as magenta squares
      for (const portal of folderPortals) {
        const pos = rotateAndScale(portal.position[0], portal.position[2]);
        if (!pos) continue;

        ctx.fillStyle = '#d9a441';
        ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
      }

      // Draw back portal as green triangle
      if (backPortalPosition) {
        const pos = rotateAndScale(backPortalPosition[0], backPortalPosition[2]);
        if (pos) {
          ctx.fillStyle = '#83a96b';
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y - 4);
          ctx.lineTo(pos.x - 3, pos.y + 2);
          ctx.lineTo(pos.x + 3, pos.y + 2);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Hostile contacts show as sharp red diamonds, distinct from file targets.
      for (const enemy of enemies) {
        const pos = rotateAndScale(enemy.position[0], enemy.position[2]);
        if (!pos) continue;

        ctx.fillStyle = '#ee5734';
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - 4);
        ctx.lineTo(pos.x + 4, pos.y);
        ctx.lineTo(pos.x, pos.y + 4);
        ctx.lineTo(pos.x - 4, pos.y);
        ctx.closePath();
        ctx.fill();
      }

      // Friendly infantry use open blue-green chevrons so the two firing lines
      // remain readable without competing with file dots or hostile diamonds.
      for (const friendly of friendlies) {
        const pos = rotateAndScale(friendly.position[0], friendly.position[2]);
        if (!pos) continue;

        ctx.strokeStyle = '#8fc9b0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pos.x - 3, pos.y - 2);
        ctx.lineTo(pos.x, pos.y + 2);
        ctx.lineTo(pos.x + 3, pos.y - 2);
        ctx.stroke();
      }

      // Draw player at center as bright cyan triangle pointing up
      ctx.fillStyle = '#e3b341';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 6);
      ctx.lineTo(centerX - 4, centerY + 3);
      ctx.lineTo(centerX + 4, centerY + 3);
      ctx.closePath();
      ctx.fill();

      // Draw cyan border around canvas
      ctx.strokeStyle = '#879b63';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, RADAR_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Animation loop — reads fresh ref values each frame
    function animate() {
      draw();
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    // Start animation
    animate();

    // Cleanup
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [tankStateRef, fileBlocks, folderPortals, backPortalPosition, enemies, friendlies]);

  return (
    <canvas
      ref={canvasRef}
      data-game-ui
      width={160}
      height={160}
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        zIndex: 50,
        borderRadius: '50%',
        border: '2px solid #879b63',
        background: 'rgba(9, 14, 7, 0.9)',
      }}
    />
  );
}
