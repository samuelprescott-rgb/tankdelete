import type { Material } from 'three';

interface PaintedFinish {
  scale?: number;
  strength?: number;
  edge?: number;
  direction?: 'vertical' | 'horizontal';
  /** Optional GLSL weight from a varying already supplied by the material. */
  mask?: string;
}

// Model-space strokes travel with the mesh, including when it is instanced or
// animated. Broad color stays visible at chase distance; the finer marks fade
// once they are too small to draw cleanly.
export function applyPaintedFinish<T extends Material>(material: T, {
  scale = 1,
  strength = 1,
  edge = 0.65,
  direction = 'horizontal',
  mask = '1.0',
}: PaintedFinish = {}): T {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  const brushScale = scale.toFixed(3);
  const pigment = strength.toFixed(3);
  const rim = edge.toFixed(3);

  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    const varyings = 'varying vec3 vPaintPosition;\nvarying vec3 vPaintNormal;\n';
    shader.vertexShader = varyings + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vPaintPosition = position;
      vPaintNormal = normal;
    `);

    shader.fragmentShader = varyings + `
      float paintedHash(vec2 cell) {
        vec3 q = fract(vec3(cell.xyx) * vec3(0.1031, 0.1030, 0.0973));
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }

      float paintedNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(paintedHash(cell), paintedHash(cell + vec2(1.0, 0.0)), f.x),
          mix(paintedHash(cell + vec2(0.0, 1.0)), paintedHash(cell + vec2(1.0, 1.0)), f.x), f.y);
      }
    ` + shader.fragmentShader.replace('#include <alphamap_fragment>', `
      {
      vec3 paintPoint = vPaintPosition * ${brushScale};
      vec2 paintUV = vec2(paintPoint.x + 0.74 * paintPoint.z, paintPoint.y + 0.32 * paintPoint.z);
      float wash = paintedNoise(paintUV * vec2(1.8, 2.9) + 4.6);
      vec2 strokeUV = ${direction === 'vertical' ? 'paintUV.yx' : 'paintUV'};
      strokeUV.y += 0.17 * strokeUV.x + 0.06 * wash;
      strokeUV = strokeUV * vec2(9.0, 39.0) + 11.0;
      float strokeVisibility = 1.0 - smoothstep(0.55, 1.8, length(fwidth(strokeUV)));
      float stroke = mix(0.5, paintedNoise(strokeUV), strokeVisibility);
      float paintPatch = smoothstep(0.25, 0.77, wash + (stroke - 0.5) * 0.13);

      vec3 paintedFace = normalize(vPaintNormal);
      float upperPlane = smoothstep(-0.48, 0.80, paintedFace.y - 0.12 * paintedFace.x);
      float wornEdge = smoothstep(0.46, 0.91, dot(paintedFace, vec3(-0.62, 0.70, 0.35)))
        * (0.22 + 0.78 * smoothstep(0.51, 0.77, stroke));
      // A warm edge catches on the materials' raised planes; shade color
      // stays cool. Contrast within a plane is much quieter than at its turn.
      vec3 colorWash = mix(vec3(0.80, 0.88, 0.91), vec3(1.11, 1.04, 0.90), upperPlane);
      colorWash *= 0.92 + 0.17 * paintPatch + (stroke - 0.5) * 0.13;
      colorWash += wornEdge * ${rim} * vec3(0.19, 0.16, 0.105);
      diffuseColor.rgb *= mix(vec3(1.0), colorWash, ${pigment} * (${mask}));
      }
      #include <alphamap_fragment>
    `);
  };

  material.customProgramCacheKey = () =>
    `${previousKey}:paint-v4:${brushScale}:${pigment}:${rim}:${direction}:${mask}`;
  material.needsUpdate = true;
  return material;
}
