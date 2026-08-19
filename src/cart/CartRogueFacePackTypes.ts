export interface CartPackedPortraitLayer {
  id: string;
  zIndex: number;
  triangles: number;
}

export interface CartPackedPortrait {
  sourceSha256: string;
  definition: unknown;
  expressions: unknown;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: readonly CartPackedPortraitLayer[];
  data: string;
}
