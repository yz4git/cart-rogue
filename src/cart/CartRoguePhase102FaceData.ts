import {
  CART_FACE_EDITOR_BUNDLE_FORMAT,
  registerCartCutinFaceEditorBundle,
  type CartFaceEditorCharacterBundle,
  type CartFaceEditorExpressionId,
  type CartFaceEditorSerializablePolygonLayer,
} from "./CartRoguePhase102AnimeCutin";
import { CART_DRIVER_FACE_PACK, CART_DRIVER_FACE_PACK_META } from "./data/CartRogueDriverFacePack";
import { CART_OPERATOR_FACE_PACK, CART_OPERATOR_FACE_PACK_META } from "./data/CartRogueOperatorFacePack";
import type { CartPackedPortrait } from "./CartRogueFacePackTypes";

const POSITION_QUANTIZATION = 10_000;
const BYTES_PER_TRIANGLE = 15;
const EXPRESSIONS: readonly CartFaceEditorExpressionId[] = [
  "neutral", "smile", "happy", "angry", "sad", "surprised", "serious", "blink",
] as const;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readInt16LE(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset] | (bytes[offset + 1] << 8);
  return value & 0x8000 ? value - 0x10000 : value;
}

export function unpackCartCutinFacePortrait(pack: CartPackedPortrait): CartFaceEditorCharacterBundle {
  const bytes = decodeBase64(pack.data);
  const expectedTriangles = pack.layers.reduce((sum, layer) => sum + layer.triangles, 0);
  if (bytes.length !== expectedTriangles * BYTES_PER_TRIANGLE) {
    throw new Error(`Invalid Cart Rogue face pack: expected ${expectedTriangles * BYTES_PER_TRIANGLE} bytes, got ${bytes.length}`);
  }

  let cursor = 0;
  const layers: CartFaceEditorSerializablePolygonLayer[] = pack.layers.map((spec) => {
    const vertexCount = spec.triangles * 3;
    const positions = new Array<number>(vertexCount * 3);
    const colors = new Array<number>(vertexCount * 3);
    const indices = new Array<number>(vertexCount);
    let positionCursor = 0;
    let colorCursor = 0;
    let indexCursor = 0;

    for (let triangle = 0; triangle < spec.triangles; triangle += 1) {
      const coordinates = new Array<number>(6);
      for (let coordinate = 0; coordinate < 6; coordinate += 1) {
        coordinates[coordinate] = readInt16LE(bytes, cursor) / POSITION_QUANTIZATION;
        cursor += 2;
      }
      const r = bytes[cursor] / 255;
      const g = bytes[cursor + 1] / 255;
      const b = bytes[cursor + 2] / 255;
      cursor += 3;

      for (let vertex = 0; vertex < 3; vertex += 1) {
        positions[positionCursor] = coordinates[vertex * 2];
        positions[positionCursor + 1] = coordinates[vertex * 2 + 1];
        positions[positionCursor + 2] = 0;
        positionCursor += 3;
        colors[colorCursor] = r;
        colors[colorCursor + 1] = g;
        colors[colorCursor + 2] = b;
        colorCursor += 3;
        indices[indexCursor] = indexCursor;
        indexCursor += 1;
      }
    }

    return { id: spec.id, zIndex: spec.zIndex, positions, colors, indices };
  });

  return {
    format: CART_FACE_EDITOR_BUNDLE_FORMAT,
    formatVersion: 1,
    definition: pack.definition,
    expressions: pack.expressions as CartFaceEditorCharacterBundle["expressions"],
    mesh: { version: 1, bounds: pack.bounds, layers },
  };
}

export const CART_CUTIN_DRIVER_FACE_BUNDLE = unpackCartCutinFacePortrait(CART_DRIVER_FACE_PACK);
export const CART_CUTIN_OPERATOR_FACE_BUNDLE = unpackCartCutinFacePortrait(CART_OPERATOR_FACE_PACK);

export const CART_CUTIN_FACE_DATA_META = {
  driver: {
    sourceSha256: CART_DRIVER_FACE_PACK.sourceSha256,
    baseStyle: "male",
    hairStyle: "twin-tail",
    ...CART_DRIVER_FACE_PACK_META,
  },
  operator: {
    sourceSha256: CART_OPERATOR_FACE_PACK.sourceSha256,
    baseStyle: "female",
    hairStyle: "wavy",
    ...CART_OPERATOR_FACE_PACK_META,
  },
} as const;

export function installCartRoguePhase102FaceData(): void {
  for (const expression of EXPRESSIONS) {
    registerCartCutinFaceEditorBundle("driver", CART_CUTIN_DRIVER_FACE_BUNDLE, expression);
    registerCartCutinFaceEditorBundle("operator", CART_CUTIN_OPERATOR_FACE_BUNDLE, expression);
  }
}

installCartRoguePhase102FaceData();
