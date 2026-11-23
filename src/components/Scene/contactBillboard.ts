// The atlas widths are in world units. At close range the largest dirt plume
// (3.8 units) should span at most about 18% of the shorter viewport edge.
export const contactBillboardGLSL = `
  float contactSizeScale(float viewDepth) {
    float shortSpan = 2.0 * max(viewDepth, 0.0)
      / max(projectionMatrix[0][0], projectionMatrix[1][1]);
    return min(1.0, shortSpan / 22.0);
  }
  float contactNearOpacity(float viewDepth) {
    return smoothstep(0.15, 0.55, viewDepth);
  }
`;
