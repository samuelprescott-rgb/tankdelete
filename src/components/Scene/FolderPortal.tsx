import { memo, useEffect, useState, useMemo } from 'react';
import { WorldLabel } from './WorldLabel';
import { buildFolderGate } from './folderGateArt';
import { FileEntry } from '../../lib/types';
import { formatBytes } from '../../lib/format';
import { PORTAL_COLOR } from '../../lib/colors';

interface FolderPortalProps {
  folder: FileEntry;
  position: [number, number, number];
  scale: number;
  childCount: number;
  totalSize: number;
  onHover: (data: any | null) => void;
}

export const FolderPortal = memo(function FolderPortal({
  folder,
  position,
  scale,
  childCount,
  totalSize,
  onHover,
}: FolderPortalProps) {
  const [hovered, setHovered] = useState(false);
  const gate = useMemo(buildFolderGate,[]);
  useEffect(()=>()=>{gate.body.dispose();gate.ink.dispose();},[gate]);

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    setHovered(true);
    onHover({ folder, childCount, totalSize });
  };

  const handlePointerOut = (e: any) => {
    e.stopPropagation();
    setHovered(false);
    onHover(null);
  };

  return (
    <group position={position} scale={scale} name="folder-checkpoint">
      <mesh geometry={gate.body} receiveShadow>
        <meshStandardMaterial vertexColors roughness={.92}/>
      </mesh>
      <mesh geometry={gate.ink}>
        <meshBasicMaterial vertexColors toneMapped={false} color={hovered ? '#fff3c4' : '#e1c89d'}/>
      </mesh>
      <mesh position={[0,1.15,1.98]} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
        <boxGeometry args={[2.0,2.5,4.0]}/>
        <meshBasicMaterial colorWrite={false} depthWrite={false}/>
      </mesh>
      {/* One text batch carries the persistent name and hover-only details. */}
      <WorldLabel
        position={[0, 2.22, 0]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.22}
        color={PORTAL_COLOR}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.014}
        outlineColor="#000000"
        lineHeight={1.15}
        textAlign="center"
      >
        {hovered
          ? `${folder.name}\n${childCount} items · ${formatBytes(totalSize)}`
          : folder.name}
      </WorldLabel>
    </group>
  );
});
