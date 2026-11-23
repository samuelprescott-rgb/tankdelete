import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { WorldLabel } from './WorldLabel';
import { createFileLabelPool } from './fileLabelPool';
import { napalmShadowMapsReady, prepareNapalmRender } from './prepareNapalmRender';
import type { BlockData } from '../../hooks/useFileBlocks';
import { createFileLabelIndex, selectProximityFileLabelPaths, fileLabelCellKey,
  FILE_LABEL_REFRESH_CELL_SIZE, FILE_LABEL_REFRESH_SECONDS } from '../../lib/fileLabelSelection';

export function ProximityFileLabels({ blocks, markedFiles }: { blocks: BlockData[]; markedFiles: Set<string> }) {
  const [visiblePaths, setVisiblePaths] = useState<string[]>([]);
  const [, refreshLayouts] = useState(0);
  const invalidate = useThree(state => state.invalidate);
  const pool = useMemo(() => createFileLabelPool(), []);
  useLayoutEffect(() => pool.retain(invalidate), [pool, invalidate]);
  useLayoutEffect(() => { pool.reconcile(blocks); refreshLayouts(value => value + 1); }, [pool, blocks]);
  const nextRefreshAtRef = useRef(0);
  const lastSelectionKeyRef = useRef('');
  const lastBlocksRef = useRef(blocks);
  const lastMarkedFilesRef = useRef(markedFiles);
  const labelIndex = useMemo(() => createFileLabelIndex(blocks), [blocks]);
  const { blocksByPath } = labelIndex;

  useFrame(({ camera, clock }) => {
    const inputsChanged = lastBlocksRef.current !== blocks || lastMarkedFilesRef.current !== markedFiles;
    if (!inputsChanged && clock.elapsedTime < nextRefreshAtRef.current) return;
    lastBlocksRef.current = blocks;
    lastMarkedFilesRef.current = markedFiles;
    nextRefreshAtRef.current = clock.elapsedTime + FILE_LABEL_REFRESH_SECONDS;
    const refreshCellX = Math.floor(camera.position.x / FILE_LABEL_REFRESH_CELL_SIZE);
    const refreshCellZ = Math.floor(camera.position.z / FILE_LABEL_REFRESH_CELL_SIZE);
    const selectionKey = fileLabelCellKey(refreshCellX, refreshCellZ);
    if (!inputsChanged && selectionKey === lastSelectionKeyRef.current) return;
    lastSelectionKeyRef.current = selectionKey;
    const nextVisiblePaths = selectProximityFileLabelPaths(labelIndex, markedFiles, camera.position.x, camera.position.z);
    setVisiblePaths(current => current.length === nextVisiblePaths.length
      && current.every((path, index) => path === nextVisiblePaths[index]) ? current : nextVisiblePaths);
  });
  // Warm the resolved, real sector text after its font worker completes. This
  // uses the same tiny HDR preparation path as ordnance, never draws hidden
  // labels in the world, and never delays a mark, shot or visible-label choice.
  useFrame(({ gl, scene, camera }) => {
    const batch = pool.preparationBatch();
    if (!batch.length || !('isWebGLRenderer' in gl) || !gl.isWebGLRenderer || gl.xr.isPresenting
      || gl.getContext().isContextLost() || !napalmShadowMapsReady(gl, scene, camera)) return;
    pool.prepared();
    try { prepareNapalmRender(gl, scene, camera, batch); }
    catch (error) { console.warn('File-label GPU preparation skipped', error); }
  });

  return <>{visiblePaths.map(path => {
    const block = blocksByPath.get(path);
    if (!block) return null;
    const armed = markedFiles.has(path), label = pool.get(path, armed);
    if (label) return <primitive key={path + (armed ? ':armed' : ':plain')} object={label} dispose={null}/>;
    return <WorldLabel key={path} position={[block.position[0], block.position[1] + block.scale * 1.65 + .45, block.position[2]]}
      rotation={[0, Math.PI, 0]} fontSize={.2} color={armed ? '#ffb76b' : '#e6ddc3'} anchorX="center" anchorY="bottom"
      outlineWidth={.02} outlineColor="#000000">{armed ? `ARMED · ${block.name}` : block.name}</WorldLabel>;
  })}</>;
}
