export function createRallyRenderer<T>(
  forceCanvas: boolean,
  webglAvailable: boolean,
  createWebGL: () => T,
  createCanvas: () => T,
  onWebGLFailure: (error: unknown) => void,
): T {
  if (forceCanvas || !webglAvailable) return createCanvas();
  try {
    return createWebGL();
  } catch (error) {
    onWebGLFailure(error);
    return createCanvas();
  }
}
