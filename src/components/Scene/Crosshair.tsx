import { useEffect, useRef } from 'react';
import { WeaponMode } from '../../lib/weapons';

interface CrosshairProps {
  weaponMode?: WeaponMode;
  eagleTargeting?: boolean;
}

const CROSSHAIR_COLORS: Record<WeaponMode, string> = {
  cannon: '#a8bf78',
  machinegun: '#ffe197',
  flamethrower: '#ff7435',
  napalm: '#e3b341',
};

export function Crosshair({ weaponMode = 'cannon', eagleTargeting = false }: CrosshairProps) {
  const ref = useRef<HTMLDivElement>(null);
  const color = eagleTargeting ? '#ffe07a' : CROSSHAIR_COLORS[weaponMode];

  useEffect(() => {
    // Hide OS cursor globally while game is active
    document.body.style.cursor = 'none';

    function handleMouseMove(e: MouseEvent) {
      if (ref.current) {
        ref.current.style.left = `${e.clientX}px`;
        ref.current.style.top = `${e.clientY}px`;
      }
    }

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 100,
        width: eagleTargeting ? 30 : 20,
        height: eagleTargeting ? 30 : 20,
        filter: eagleTargeting ? 'drop-shadow(0 0 8px rgba(255, 197, 63, 0.9))' : 'none',
      }}
    >
      {/* Outer circle */}
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          border: `2px solid ${color}`,
          borderRadius: '50%',
        }}
      />

      {/* Vertical line */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '-8px',
          width: 2,
          height: 36,
          backgroundColor: color,
          transform: 'translateX(-50%)',
        }}
      />

      {/* Horizontal line */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '-8px',
          height: 2,
          width: 36,
          backgroundColor: color,
          transform: 'translateY(-50%)',
        }}
      />

      {eagleTargeting && (
        <div
          style={{
            position: 'absolute',
            top: 38,
            left: '50%',
            width: 180,
            transform: 'translateX(-50%)',
            color,
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textAlign: 'center',
            textShadow: '0 1px 3px #000, 0 0 9px rgba(255, 197, 63, 0.8)',
          }}
        >
          EAGLE STRAFE · CLICK TERRAIN
        </div>
      )}
    </div>
  );
}
