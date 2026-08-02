import { useEffect, useRef } from 'react';
import { WeaponMode } from '../../lib/weapons';

interface CrosshairProps {
  weaponMode?: WeaponMode;
}

const CROSSHAIR_COLORS: Record<WeaponMode, string> = {
  cannon: '#a8bf78',
  flamethrower: '#ff7435',
  napalm: '#e3b341',
};

export function Crosshair({ weaponMode = 'cannon' }: CrosshairProps) {
  const ref = useRef<HTMLDivElement>(null);
  const color = CROSSHAIR_COLORS[weaponMode];

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
        width: 20,
        height: 20,
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
    </div>
  );
}
