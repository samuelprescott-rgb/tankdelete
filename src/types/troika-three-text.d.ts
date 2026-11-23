declare module 'troika-three-text' {
  import { Mesh, Material } from 'three';
  /** Public subset used by the bounded file-name layout pool. */
  export class Text extends Mesh {
    text: string;
    font: string;
    fontSize: number;
    sdfGlyphSize: number;
    anchorX: string | number;
    anchorY: string | number;
    color: string | number;
    outlineColor: string | number;
    outlineWidth: number;
    material: Material | Material[];
    sync(onComplete?: () => void): void;
    dispose(): void;
  }
}
