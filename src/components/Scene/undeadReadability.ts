import type { MeshStandardMaterial } from 'three';

// Values use camera depth in scene units (metres). Close portraits keep their
// painted shadows; far contacts still disappear into the original scene fog.
export const UNDEAD_VALUE_BAND = Object.freeze({ near: 3, full: 20, recede: 58, far: 83 });
const SURFACE_WEIGHT = Object.freeze({ cloth: 0.48, skin: 0.61, helmet: 0.70 });

/** A moonlit value separation for regular Horde units, on their existing
 * opaque surfaces. Do not use for the boss, world, eyes or transparent FX. */
export function applyUndeadReadability<T extends MeshStandardMaterial>(
  material: T,
  surface: keyof typeof SURFACE_WEIGHT,
): T {
  const originalCompile = material.onBeforeCompile;
  const originalKey = material.customProgramCacheKey();
  const { near, full, recede, far } = UNDEAD_VALUE_BAND;
  const strength = SURFACE_WEIGHT[surface].toFixed(3);

  material.onBeforeCompile = (shader, renderer) => {
    originalCompile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float undeadDepth = vViewPosition.z;
        float farContact = smoothstep(${near}.0, ${full}.0, undeadDepth)
          * (1.0 - smoothstep(${recede}.0, ${far}.0, undeadDepth));
        if (farContact > 0.0) {
          // The same world-space moon that lights the canopy picks out a
          // shoulder or cheek as the walking actor turns under it.
          #if NUM_DIR_LIGHTS > 0
          float facingMoon = dot(normal, directionalLights[0].direction);
          float grazing = 1.0 - smoothstep(0.18, 0.78, max(0.0, dot(normal, geometryViewDir)));
          float raisedPlane = smoothstep(0.24, 0.72, facingMoon);
          float localLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
          float shadowRoom = 1.0 - smoothstep(0.09, 0.27, localLuma);
          float edgeCatch = raisedPlane * (0.18 + 0.82*grazing);
          float bodyShadow = (1.0-edgeCatch) * (0.54 + 0.46*shadowRoom);
          outgoingLight *= 1.0 - farContact * bodyShadow * 0.87;
          vec3 silver = mix(vec3(0.19, 0.29, 0.34), diffuseColor.rgb, 0.20);
          outgoingLight += silver * (farContact * raisedPlane * (0.10 + 1.04*grazing) * ${strength});
          #if NUM_SPOT_LIGHTS > 0
          // The coat sleeve picks up amber only as it crosses a real
          // checkpoint lamp. Both its cone and distance falloff apply.
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
            {
            IncidentLight lamp;
            getSpotLightInfo(spotLights[ i ], -vViewPosition, lamp);
            // Three orders mapped lights around shadow-only spots. Apply the
            // same projected mask to the wet edge as to the base diffuse.
            #if UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS
              #define EDGE_MAP UNROLLED_LOOP_INDEX
            #elif UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS
              #define EDGE_MAP NUM_SPOT_LIGHT_MAPS
            #else
              #define EDGE_MAP (UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS)
            #endif
            #if EDGE_MAP < NUM_SPOT_LIGHT_MAPS
              vec4 projection = vSpotLightCoord[ i ];
              lamp.color *= texture2D(spotLightMap[EDGE_MAP], projection.xy / projection.w).rgb;
            #endif
            #undef EDGE_MAP
            float energy = max(lamp.color.r, max(lamp.color.g, lamp.color.b));
            vec3 lampHue = lamp.color / max(energy, .001);
            float litPlane = smoothstep(-.24, .60, dot(normal, lamp.direction));
            float pickup = smoothstep(.16, 2.40, energy) * litPlane * (.33 + .85*grazing);
            outgoingLight += lampHue * (pickup * farContact * ${strength});
            }
          }
          #pragma unroll_loop_end
          #endif
          #endif
        }
      }
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => `${originalKey}:undead-value-v6:${surface}`;
  material.needsUpdate = true;
  return material;
}
