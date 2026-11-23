import { useRef, useEffect } from 'react';
import type { Vector3 } from 'three';
import type { ZombieArchetype } from '../../lib/zombieEpilogue';
import {REAR_RADIO} from '../../lib/rearStronghold';
import {setRadarOffset} from '../../lib/radar';

import { drawRadarEcho, drawRadarSweep, drawTunnelLock, sweepAngleAt } from './radarEffects';

interface MinimapProps {
  tankStateRef: React.RefObject<{ position: [number, number, number]; rotation: number }>;
  fileBlocks: Array<{
    position: [number, number, number];
    color: string;
    isMarked?: boolean;
    isObjective?: boolean;
    underAttackUntil?: number;
  }>;
  folderPortals: Array<{ position: [number, number, number] }>;
  backPortalPosition: [number, number, number] | null;
  enemies: Array<{ id?:string; position: [number, number, number] }>;
  campaignRadar?:boolean; radioFix?:boolean;
  tunnelFix?:{x:number;z:number};
  enemyPosesRef?:React.RefObject<ReadonlyMap<string,{position:Vector3}>>;
  friendlies?: ReadonlyArray<{ position: [number, number, number] }>;
  zombiePosesRef?: React.RefObject<ReadonlyMap<string, {
    position: Vector3;
    active: boolean;
    archetype?: ZombieArchetype;
  }>>;
}

export function Minimap({
  tankStateRef,
  fileBlocks,
  folderPortals,
  backPortalPosition,
  enemies, campaignRadar=false,radioFix=false,tunnelFix,enemyPosesRef,
  friendlies = [],
  zombiePosesRef,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const tunnelAcquiredAt = useRef(0);
  useEffect(() => {
    tunnelAcquiredAt.current = performance.now();
  }, [tunnelFix?.x, tunnelFix?.z]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const CANVAS_SIZE = 160;
    const RADAR_RADIUS = 70; // pixels on canvas
    const WORLD_RADIUS = 30; // units in 3D world space
    const WORLD_RADIUS_SQUARED = WORLD_RADIUS * WORLD_RADIUS;
    const SCALE = RADAR_RADIUS / WORLD_RADIUS;
    const DRAW_INTERVAL_MS = 1000 / 30;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contactPoint = { x: 0, y: 0, clamped: false };
    let lastDrawAt = -Infinity;

    // Draw the minimap
    function draw(now: number) {
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

      const time = now / 1000;
      const sweep = sweepAngleAt(time);
      if (!reducedMotion.matches) drawRadarSweep(ctx, centerX, RADAR_RADIUS, sweep);

      // Helper function to rotate point relative to tank
      // Rotation is identical for every contact in this draw. Computing it once
      // avoids dozens of duplicate trigonometric calls per radar refresh.
      const cos = Math.cos(tankRotation);
      const sin = Math.sin(tankRotation);
      const wallTime = Date.now();
      function rotateAndScale(
        worldX: number,
        worldZ: number,
        clampToEdge = false,
      ) {
        // Calculate relative position from tank
        const relX = worldX - tankPosition[0];
        const relZ = worldZ - tankPosition[2];

        // Check if within radar range
        const distanceSquared = relX * relX + relZ * relZ;
        const outsideRadar = distanceSquared > WORLD_RADIUS_SQUARED;
        if (outsideRadar && !clampToEdge) return false;

        setRadarOffset(contactPoint,relX,relZ,cos,sin);

        // Scale to canvas coordinates (note: Z maps to Y in 2D)
        const contactScale = outsideRadar
          ? (RADAR_RADIUS - 7) / Math.max(Math.sqrt(distanceSquared), 0.0001)
          : SCALE;
        contactPoint.x = centerX + contactPoint.x * contactScale;
        contactPoint.y = centerY + contactPoint.y * contactScale;
        contactPoint.clamped = outsideRadar;
        return true;
      }

      // Draw file blocks as colored dots
      for (const block of fileBlocks) {
        if (!rotateAndScale(block.position[0], block.position[2], block.isObjective)) continue;
        const pos = contactPoint;

        ctx.fillStyle = block.isMarked ? '#e36d32' : block.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // A green confirmation ring distinguishes the byte-verified duplicate
        // bonus target from ordinary files and hostile contacts.
        if (block.isObjective) {
          const threatened = (block.underAttackUntil ?? 0)>wallTime;
          ctx.strokeStyle = threatened ? '#ffaf72' : pos.clamped ? '#dcf59a' : '#a8cf6b';
          ctx.lineWidth = pos.clamped ? 2 : 1.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, threatened ? 7+1.8*Math.sin(time*4) : pos.clamped ? 5.5 : 5, 0, Math.PI * 2);
          ctx.stroke();
          if (pos.clamped) {
            const angle = Math.atan2(pos.y - centerY, pos.x - centerX);
            ctx.fillStyle = threatened ? '#ffaf72' : '#dcf59a';
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
        if (!rotateAndScale(portal.position[0], portal.position[2])) continue;
        const pos = contactPoint;

        ctx.fillStyle = '#d9a441';
        ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
      }

      // Draw back portal as green triangle
      if (backPortalPosition) {
        if (rotateAndScale(backPortalPosition[0], backPortalPosition[2])) {
          const pos = contactPoint;
          ctx.fillStyle = '#83a96b';
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y - 4);
          ctx.lineTo(pos.x - 3, pos.y + 2);
          ctx.lineTo(pos.x + 3, pos.y + 2);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Once the fighting is over, the receiver acquires the hut's signal. The player still drives there.
      if(radioFix && rotateAndScale(REAR_RADIO[0],REAR_RADIO[2],true)){
        const {x,y}=contactPoint;ctx.strokeStyle='#facb79';ctx.lineWidth=1.7;
        ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.moveTo(x,y+2);ctx.lineTo(x,y-2);ctx.stroke();
      }

      // Late stragglers get a coarse bearing, not through-wall world outlines.
      for (const enemy of enemies) {
        const live=enemy.id?enemyPosesRef?.current.get(enemy.id)?.position:undefined;
        if (!rotateAndScale(live?.x??enemy.position[0],live?.z??enemy.position[2],campaignRadar&&enemies.length<=3)) continue;
        const pos = contactPoint;

        if (!pos.clamped && !reducedMotion.matches) {
          drawRadarEcho(ctx, pos.x, pos.y, centerX, RADAR_RADIUS, sweep);
        }
        ctx.fillStyle = '#ee5734';
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - 4);
        ctx.lineTo(pos.x + 4, pos.y);
        ctx.lineTo(pos.x, pos.y + 4);
        ctx.lineTo(pos.x - 4, pos.y);
        ctx.closePath();
        ctx.fill();
      }

      // The arcade epilogue uses amber crosses so undead contacts remain
      // distinct from both conventional hostiles and real file targets.
      for (const pose of zombiePosesRef?.current?.values() ?? []) {
        if (!pose.active) continue;
        if (!rotateAndScale(pose.position.x, pose.position.z, true)) continue;
        const pos = contactPoint;

        if (pose.archetype === 'boss') {
          const pulse = 6.2 + Math.sin(time * 5.5) * 1.15;
          ctx.fillStyle = pos.clamped ? '#fff0b8' : '#d66c32';
          ctx.strokeStyle = '#ffd77b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y - pulse);
          ctx.lineTo(pos.x + pulse, pos.y);
          ctx.lineTo(pos.x, pos.y + pulse);
          ctx.lineTo(pos.x - pulse, pos.y);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pulse + 3, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }

        ctx.strokeStyle = pos.clamped ? '#ffe2a0' : '#f0a146';
        ctx.lineWidth = pos.clamped ? 2 : 1.6;
        ctx.beginPath();
        ctx.moveTo(pos.x - 3.5, pos.y - 3.5);
        ctx.lineTo(pos.x + 3.5, pos.y + 3.5);
        ctx.moveTo(pos.x + 3.5, pos.y - 3.5);
        ctx.lineTo(pos.x - 3.5, pos.y + 3.5);
        ctx.stroke();
      }

      // Friendly infantry use open blue-green chevrons so the two firing lines
      // remain readable without competing with file dots or hostile diamonds.
      for (const friendly of friendlies) {
        if (!rotateAndScale(friendly.position[0], friendly.position[2])) continue;
        const pos = contactPoint;

        ctx.strokeStyle = '#8fc9b0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pos.x - 3, pos.y - 2);
        ctx.lineTo(pos.x, pos.y + 2);
        ctx.lineTo(pos.x + 3, pos.y - 2);
        ctx.stroke();
      }

      if (tunnelFix && rotateAndScale(tunnelFix.x, tunnelFix.z, true)) {
        const age = reducedMotion.matches ? Infinity : (now - tunnelAcquiredAt.current) / 1000;
        drawTunnelLock(ctx, contactPoint.x, contactPoint.y, age);
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
    function animate(now: number) {
      if (now - lastDrawAt >= DRAW_INTERVAL_MS) {
        lastDrawAt = now;
        draw(now);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [tankStateRef, fileBlocks, folderPortals, backPortalPosition, enemies, friendlies, zombiePosesRef, campaignRadar,radioFix,tunnelFix,enemyPosesRef]);

  return (
    <canvas
      ref={canvasRef}
      data-game-ui
      aria-label={campaignRadar ? 'Tank radar: forward is up; red diamonds mark infantry, amber brackets warn of a tunnel and an amber ring marks the acquired hut radio' : 'Tank radar: forward is up; a pulsing amber ring marks a threatened archive'}
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
