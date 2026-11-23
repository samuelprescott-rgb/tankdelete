import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { WORLD_LABEL_FONT, offlineWorldLabel } from '../../lib/worldLabelFont';
import { SECTOR_FILE_CAPACITY } from '../../lib/sectorPaging';

export interface LabelFile {
  path: string; name: string; scale: number; position: readonly [number, number, number];
}

interface LayoutPair {
  name: string; plain: Text; armed: Text; base: THREE.MeshBasicMaterial;
  active: boolean; retired: boolean; pending: number;
}
const NO_PREPARATION: readonly THREE.Mesh[] = [];

/** Real sector labels, laid out once before a weapon hit asks to show them.
 * Unselected layouts stay detached: they add no world draws or per-frame
 * transforms. Small tombstones preserve undo and keep the prepared program
 * alive. Paging evicts inactive layouts before admitting new files. */
export function createFileLabelPool(makeText: () => Text = () => new Text()) {
  const pairs = new Map<string, LayoutPair>();
  let owners = 0, disposed = false, revision = 0, prepared = -1;
  let changed = () => {};
  const retire = (pair: LayoutPair) => {
    if (pair.retired) return;
    pair.retired = true;
    pair.plain.dispose(); pair.armed.dispose(); pair.base.dispose();
  };
  function makeLayout(file: LabelFile, armed: boolean, base: THREE.MeshBasicMaterial) {
    const text = makeText();
    text.font = WORLD_LABEL_FONT;
    text.text = offlineWorldLabel(armed ? `ARMED · ${file.name}` : file.name);
    text.fontSize = .2; text.sdfGlyphSize = 64;
    text.anchorX = 'center'; text.anchorY = 'bottom';
    text.color = armed ? '#ffb76b' : '#e6ddc3';
    text.outlineWidth = .02; text.outlineColor = '#000000'; text.material = base;
    text.rotation.set(0, Math.PI, 0);
    return text;
  }
  return {
    retain(notify: () => void) {
      if (disposed) throw Error('Cannot reuse a retired file-label pool');
      owners++; changed = notify;
      let released = false;
      return () => {
        if (released) return;
        released = true; owners--;
        queueMicrotask(() => {
          if (owners || disposed) return;
          disposed = true; changed = () => {};
          for (const pair of pairs.values()) retire(pair);
          pairs.clear();
        });
      };
    },
    reconcile(files: readonly LabelFile[]) {
      if (disposed) return;
      const live = new Set(files.map(file => file.path));
      for (const [path, pair] of pairs) pair.active = live.has(path);
      for (const file of files) {
        let pair = pairs.get(file.path);
        if (pair && pair.name !== file.name) { retire(pair); pairs.delete(file.path); pair = undefined; }
        if (!pair) {
          if (pairs.size >= SECTOR_FILE_CAPACITY) {
            const spare = [...pairs].find(([, candidate]) => !candidate.active);
            if (spare) { retire(spare[1]); pairs.delete(spare[0]); }
          }
          // The scene is capped at80 files. Keep the cache bounded even for
          // malformed callers; the UI retains its ordinary WorldLabel fallback.
          if (pairs.size >= SECTOR_FILE_CAPACITY) continue;
          const base = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true });
          pair = { name:file.name, plain:makeLayout(file, false, base), armed:makeLayout(file, true, base),
            base, active:true, retired:false, pending:2 };
          pairs.set(file.path, pair); revision++;
          const owned = pair;
          for (const text of [owned.plain, owned.armed]) text.sync(() => {
            owned.pending--;
            // Troika can finish a worker job after a page/scene exits. Release
            // its final geometry too; never reattach it or notify an old scene.
            if (owned.retired) text.dispose();
            else changed();
          });
        }
        pair.active = true;
        for (const text of [pair.plain, pair.armed]) {
          text.position.set(file.position[0], file.position[1] + file.scale * 1.65 + .45, file.position[2]);
        }
      }
    },
    get(path: string, armed: boolean) {
      const pair = pairs.get(path);
      return pair?.active ? armed ? pair.armed : pair.plain : undefined;
    },
    /** One actual prepared layout represents both identical shader variants.
     * The pool owns geometry/material; the temporary proxy owns neither. */
    preparationBatch() {
      if (disposed || prepared === revision || !pairs.size) return NO_PREPARATION;
      for (const pair of pairs.values()) if (pair.pending) return NO_PREPARATION;
      const pair = pairs.values().next().value!;
      const source = pair.armed;
      const proxy = new THREE.Mesh(source.geometry, source.material);
      proxy.onBeforeRender = (...args) => source.onBeforeRender(...args);
      return [proxy];
    },
    prepared() { prepared = revision; },
    get size() { return pairs.size; },
  };
}
