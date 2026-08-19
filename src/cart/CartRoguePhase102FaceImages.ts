import {
  CART_ANIME_CUTIN_EVENT,
  type CartCutinInstance,
  type CartFaceEditorExpressionId,
} from "./CartRoguePhase102AnimeCutin";
import driver00 from "./data/portraits-small/driver-00";
import driver01 from "./data/portraits-small/driver-01";
import driver02 from "./data/portraits-small/driver-02";
import driver03 from "./data/portraits-small/driver-03";
import driver04 from "./data/portraits-small/driver-04";
import driver05 from "./data/portraits-small/driver-05";
import driver06 from "./data/portraits-small/driver-06";
import driver07 from "./data/portraits-small/driver-07";
import operator00 from "./data/portraits-small/operator-00";
import operator01 from "./data/portraits-small/operator-01";
import operator02 from "./data/portraits-small/operator-02";
import operator03 from "./data/portraits-small/operator-03";
import operator04 from "./data/portraits-small/operator-04";
import operator05 from "./data/portraits-small/operator-05";
import operator06 from "./data/portraits-small/operator-06";
import operator07 from "./data/portraits-small/operator-07";
import operator08 from "./data/portraits-small/operator-08";
import operator09 from "./data/portraits-small/operator-09";

interface ExpressionTransformDelta {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export interface CartPhase102ExpressionPreset {
  eyeStyle?: string;
  browStyle?: string;
  mouthStyle?: string;
  transforms?: {
    eyes?: ExpressionTransformDelta;
    brows?: ExpressionTransformDelta;
    mouth?: ExpressionTransformDelta;
  };
}

/** Exact Expression System v1 presets exported by yz4git/face-editor. */
export const CART_PHASE102_FACE_EXPRESSIONS: Record<CartFaceEditorExpressionId, CartPhase102ExpressionPreset> = {
  neutral: {},
  smile: {
    mouthStyle: "smile",
    transforms: { eyes: { scaleY: 0.98 }, brows: { y: 0.008 }, mouth: { scaleX: 1.03, y: 0.004 } },
  },
  happy: {
    eyeStyle: "soft",
    browStyle: "arched",
    mouthStyle: "smile-open",
    transforms: { eyes: { scaleY: 0.92, y: -0.004 }, brows: { y: 0.018 }, mouth: { scaleX: 1.06, scaleY: 1.04, y: 0.008 } },
  },
  angry: {
    eyeStyle: "determined",
    browStyle: "angled",
    mouthStyle: "frown",
    transforms: { eyes: { scaleY: 0.94 }, brows: { y: -0.018, rotation: 0.075 }, mouth: { scaleX: 0.96, y: -0.004 } },
  },
  sad: {
    eyeStyle: "sleepy",
    browStyle: "worried",
    mouthStyle: "frown",
    transforms: { eyes: { y: -0.008, scaleY: 0.96 }, brows: { y: 0.012, rotation: -0.055 }, mouth: { scaleX: 0.98, y: -0.008 } },
  },
  surprised: {
    eyeStyle: "round",
    browStyle: "raised",
    mouthStyle: "surprised",
    transforms: { eyes: { scaleX: 1.06, scaleY: 1.1, y: 0.006 }, brows: { y: 0.045 }, mouth: { scaleX: 1.08, scaleY: 1.08, y: 0.002 } },
  },
  serious: {
    eyeStyle: "determined",
    browStyle: "straight",
    mouthStyle: "neutral",
    transforms: { eyes: { scaleY: 0.95 }, brows: { y: -0.006 }, mouth: { scaleX: 0.98 } },
  },
  blink: {
    eyeStyle: "closed",
    transforms: { eyes: { scaleY: 0.92, y: -0.002 } },
  },
};

interface FeatureBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RasterFaceProfile {
  skin: string;
  hair: string;
  mouth: string;
  pixelsPerUnit: number;
  baseEyeStyle: string;
  baseBrowStyle: string;
  baseMouthStyle: string;
  leftEye: FeatureBox;
  rightEye: FeatureBox;
  leftBrow: FeatureBox;
  rightBrow: FeatureBox;
  mouthBox: FeatureBox;
}

/**
 * Pixel bounds are derived from the supplied CharacterBundle mesh after the same
 * 320x220 portrait crop used by Phase102. They let us reuse the real polygon
 * portrait while applying the bundle's expression deltas without shipping eight
 * duplicate portrait images per character.
 */
export const CART_PHASE102_FACE_RASTER_PROFILES = {
  driver: {
    skin: "#f6bb8c",
    hair: "#39281d",
    mouth: "#7b3437",
    pixelsPerUnit: 83.1472502269,
    baseEyeStyle: "round",
    baseBrowStyle: "bold",
    baseMouthStyle: "frown",
    leftEye: { x: 119, y: 84, width: 34, height: 34 },
    rightEye: { x: 167, y: 84, width: 34, height: 34 },
    leftBrow: { x: 117, y: 68, width: 35, height: 14 },
    rightBrow: { x: 168, y: 68, width: 35, height: 14 },
    mouthBox: { x: 141, y: 127, width: 39, height: 18 },
  },
  operator: {
    skin: "#d99b6c",
    hair: "#d95c70",
    mouth: "#7b3437",
    pixelsPerUnit: 82.5090812549,
    baseEyeStyle: "side-glance",
    baseBrowStyle: "raised",
    baseMouthStyle: "smile",
    leftEye: { x: 123, y: 83, width: 35, height: 35 },
    rightEye: { x: 171, y: 83, width: 35, height: 35 },
    leftBrow: { x: 121, y: 67, width: 35, height: 15 },
    rightBrow: { x: 172, y: 67, width: 35, height: 15 },
    mouthBox: { x: 145, y: 122, width: 39, height: 24 },
  },
} as const satisfies Record<"driver" | "operator", RasterFaceProfile>;

export const CART_DRIVER_PORTRAIT_BASE64 = `${driver00}${driver01}${driver02}${driver03}${driver04}${driver05}${driver06}${driver07}`;
export const CART_OPERATOR_PORTRAIT_BASE64 = `${operator00}${operator01}${operator02}${operator03}${operator04}${operator05}${operator06}${operator07}${operator08}${operator09}`;

export const CART_PHASE102_FACE_IMAGE_META = {
  driver: {
    sourceSha256: "ff60e3c3d93f8e421003a7474962aca8ee0739ec68cba7becd9dbff74cadc0a1",
    portraitSha256: "ac1c7a9d55bb58781ed8ae72c8b54922ee4c045e9a3a58ae9264188e877072f4",
    sourceFormat: "face-editor-polygon-character",
    baseStyle: "male",
    hairStyle: "twin-tail",
    faceShape: "diamond",
    eyeStyle: "round",
    browStyle: "bold",
    mouthStyle: "frown",
  },
  operator: {
    sourceSha256: "ca0a8b8e0e6823a0056bad8738612d0b8e02d260852575fa3c42438584cc1a99",
    portraitSha256: "0ac5cefee65cebe8120c5de88b0e07a777be4a28c17391e44f444ecbcff7617c",
    sourceFormat: "face-editor-polygon-character",
    baseStyle: "female",
    hairStyle: "wavy",
    faceShape: "round",
    eyeStyle: "side-glance",
    browStyle: "raised",
    mouthStyle: "smile",
  },
} as const;

function dataUri(base64: string): string {
  return `data:image/webp;base64,${base64}`;
}

function parseHex(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

function scaledBox(box: FeatureBox, canvas: HTMLCanvasElement): FeatureBox {
  const sx = canvas.width / 320;
  const sy = canvas.height / 220;
  return { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy };
}

function roundedPatch(context: CanvasRenderingContext2D, box: FeatureBox, color: string): void {
  const pad = Math.max(1.5, box.height * 0.08);
  const x = box.x - pad;
  const y = box.y - pad;
  const width = box.width + pad * 2;
  const height = box.height + pad * 2;
  const radius = Math.min(width, height) * 0.34;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.fill();
}

function featureLayer(
  source: HTMLCanvasElement,
  box: FeatureBox,
  skin: string,
): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.ceil(box.width));
  layer.height = Math.max(1, Math.ceil(box.height));
  const context = layer.getContext("2d", { willReadFrequently: true });
  if (!context) return layer;
  context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, layer.width, layer.height);
  const image = context.getImageData(0, 0, layer.width, layer.height);
  const [sr, sg, sb] = parseHex(skin);
  for (let i = 0; i < image.data.length; i += 4) {
    const dr = image.data[i] - sr;
    const dg = image.data[i + 1] - sg;
    const db = image.data[i + 2] - sb;
    if (dr * dr + dg * dg + db * db < 3600) image.data[i + 3] = 0;
  }
  context.putImageData(image, 0, 0);
  return layer;
}

function copyFeature(
  context: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  box: FeatureBox,
  translateX: number,
  translateY: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
): void {
  const cx = box.x + box.width * 0.5 + translateX;
  const cy = box.y + box.height * 0.5 + translateY;
  context.save();
  context.translate(cx, cy);
  context.rotate(rotation);
  context.scale(scaleX, scaleY);
  context.drawImage(layer, -box.width * 0.5, -box.height * 0.5, box.width, box.height);
  context.restore();
}

function eyeStyleAdjust(style: string | undefined, side: -1 | 1): readonly [number, number, number, number] {
  if (style === "soft") return [1, 0.82, 0, 0];
  if (style === "determined") return [1, 0.82, side * -0.05, 0];
  if (style === "sleepy") return [1, 0.6, 0, 1.5];
  if (style === "round") return [1.06, 1.18, 0, 0];
  return [1, 1, 0, 0];
}

function browStyleAdjust(style: string | undefined, side: -1 | 1): readonly [number, number, number] {
  if (style === "arched") return [1, side * -0.035, -1.2];
  if (style === "angled") return [1, side * 0.11, 0.5];
  if (style === "worried") return [1, side * -0.1, -1];
  if (style === "straight") return [0.82, 0, 0];
  if (style === "raised") return [1, 0, -2.3];
  return [1, 0, 0];
}

function applyEyes(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  profile: RasterFaceProfile,
  preset: CartPhase102ExpressionPreset,
): void {
  const delta = preset.transforms?.eyes ?? {};
  const sx = delta.scaleX ?? 1;
  const sy = delta.scaleY ?? 1;
  const translateX = (delta.x ?? 0) * profile.pixelsPerUnit * (canvas.width / 320);
  const translateY = -(delta.y ?? 0) * profile.pixelsPerUnit * (canvas.height / 220);
  for (const side of [-1, 1] as const) {
    const box = scaledBox(side < 0 ? profile.leftEye : profile.rightEye, canvas);
    roundedPatch(context, box, profile.skin);
    if (preset.eyeStyle === "closed") {
      context.strokeStyle = profile.hair;
      context.lineWidth = Math.max(2, box.height * 0.075);
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(box.x + box.width * 0.18, box.y + box.height * 0.56 + translateY);
      context.quadraticCurveTo(
        box.x + box.width * 0.5,
        box.y + box.height * 0.64 + translateY,
        box.x + box.width * 0.82,
        box.y + box.height * 0.56 + translateY,
      );
      context.stroke();
      continue;
    }
    const layer = featureLayer(source, box, profile.skin);
    const [styleX, styleY, styleRotation, styleYShift] = eyeStyleAdjust(preset.eyeStyle, side);
    copyFeature(
      context,
      layer,
      box,
      translateX,
      translateY + styleYShift * (canvas.height / 220),
      sx * styleX,
      sy * styleY,
      -(delta.rotation ?? 0) + styleRotation,
    );
  }
}

function applyBrows(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  profile: RasterFaceProfile,
  preset: CartPhase102ExpressionPreset,
): void {
  const delta = preset.transforms?.brows ?? {};
  const sx = delta.scaleX ?? 1;
  const sy = delta.scaleY ?? 1;
  const translateX = (delta.x ?? 0) * profile.pixelsPerUnit * (canvas.width / 320);
  const translateY = -(delta.y ?? 0) * profile.pixelsPerUnit * (canvas.height / 220);
  for (const side of [-1, 1] as const) {
    const box = scaledBox(side < 0 ? profile.leftBrow : profile.rightBrow, canvas);
    const layer = featureLayer(source, box, profile.skin);
    roundedPatch(context, box, profile.skin);
    const [styleScaleY, styleRotation, styleYShift] = browStyleAdjust(preset.browStyle, side);
    copyFeature(
      context,
      layer,
      box,
      translateX,
      translateY + styleYShift * (canvas.height / 220),
      sx,
      sy * styleScaleY,
      -(delta.rotation ?? 0) * side + styleRotation,
    );
  }
}

function drawMouthStyle(
  context: CanvasRenderingContext2D,
  box: FeatureBox,
  style: string,
  color: string,
  scaleX: number,
  scaleY: number,
  translateX: number,
  translateY: number,
): void {
  const cx = box.x + box.width * 0.5 + translateX;
  const cy = box.y + box.height * 0.5 + translateY;
  const halfWidth = box.width * 0.38 * scaleX;
  const halfHeight = box.height * 0.34 * scaleY;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(2, box.height * 0.1);
  context.lineCap = "round";
  if (style === "smile") {
    context.beginPath();
    context.moveTo(cx - halfWidth, cy - halfHeight * 0.15);
    context.quadraticCurveTo(cx, cy + halfHeight, cx + halfWidth, cy - halfHeight * 0.15);
    context.stroke();
  } else if (style === "frown") {
    context.beginPath();
    context.moveTo(cx - halfWidth, cy + halfHeight * 0.35);
    context.quadraticCurveTo(cx, cy - halfHeight, cx + halfWidth, cy + halfHeight * 0.35);
    context.stroke();
  } else if (style === "neutral") {
    context.beginPath();
    context.moveTo(cx - halfWidth * 0.9, cy);
    context.lineTo(cx + halfWidth * 0.9, cy);
    context.stroke();
  } else {
    const width = style === "surprised" ? halfWidth * 0.55 : halfWidth;
    const height = style === "surprised" ? halfHeight * 1.25 : halfHeight;
    context.beginPath();
    context.ellipse(cx, cy, width, height, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#e26d78";
    context.beginPath();
    context.ellipse(cx, cy + height * 0.38, width * 0.58, height * 0.28, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function applyMouth(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  profile: RasterFaceProfile,
  preset: CartPhase102ExpressionPreset,
): void {
  const delta = preset.transforms?.mouth ?? {};
  const box = scaledBox(profile.mouthBox, canvas);
  const scaleX = delta.scaleX ?? 1;
  const scaleY = delta.scaleY ?? 1;
  const translateX = (delta.x ?? 0) * profile.pixelsPerUnit * (canvas.width / 320);
  const translateY = -(delta.y ?? 0) * profile.pixelsPerUnit * (canvas.height / 220);
  const requestedStyle = preset.mouthStyle ?? profile.baseMouthStyle;
  const layer = featureLayer(source, box, profile.skin);
  roundedPatch(context, box, profile.skin);
  if (requestedStyle === profile.baseMouthStyle) {
    copyFeature(context, layer, box, translateX, translateY, scaleX, scaleY, -(delta.rotation ?? 0));
    return;
  }
  drawMouthStyle(context, box, requestedStyle, profile.mouth, scaleX, scaleY, translateX, translateY);
}

function drawBaseImage(image: HTMLImageElement, canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const source = document.createElement("canvas");
  source.width = canvas.width;
  source.height = canvas.height;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return null;
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = (canvas.width - width) * 0.5;
  const y = (canvas.height - height) * 0.5;
  sourceContext.clearRect(0, 0, source.width, source.height);
  sourceContext.drawImage(image, x, y, width, height);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
  return source;
}

export function renderCartPhase102ExpressionPortrait(
  characterId: "driver" | "operator",
  expression: CartFaceEditorExpressionId,
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
): boolean {
  const context = canvas.getContext("2d");
  if (!context || !image.complete || image.naturalWidth <= 0) return false;
  const source = drawBaseImage(image, canvas);
  if (!source) return false;
  if (expression === "neutral") return true;
  const preset = CART_PHASE102_FACE_EXPRESSIONS[expression];
  const profile = CART_PHASE102_FACE_RASTER_PROFILES[characterId];
  applyEyes(context, source, canvas, profile, preset);
  applyBrows(context, source, canvas, profile, preset);
  applyMouth(context, source, canvas, profile, preset);
  return true;
}

const portraitImages: Partial<Record<"driver" | "operator", HTMLImageElement>> = {};
let expressionListenerInstalled = false;

function portraitImage(characterId: "driver" | "operator"): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let image = portraitImages[characterId];
  if (image) return image;
  image = new Image();
  image.decoding = "async";
  image.src = dataUri(characterId === "driver" ? CART_DRIVER_PORTRAIT_BASE64 : CART_OPERATOR_PORTRAIT_BASE64);
  portraitImages[characterId] = image;
  return image;
}

function drawActiveExpression(instance: CartCutinInstance): void {
  if (typeof document === "undefined") return;
  const canvas = document.querySelector<HTMLCanvasElement>("#cart-anime-cutin-v1 canvas");
  if (!canvas) return;
  const image = portraitImage(instance.characterId);
  if (!image) return;
  const draw = () => renderCartPhase102ExpressionPortrait(instance.characterId, instance.expression, image, canvas);
  if (image.complete && image.naturalWidth > 0) draw();
  else image.addEventListener("load", draw, { once: true });
}

export function installCartRoguePhase102FaceImages(): void {
  if (typeof window === "undefined" || expressionListenerInstalled) return;
  expressionListenerInstalled = true;
  portraitImage("driver");
  portraitImage("operator");
  window.addEventListener(CART_ANIME_CUTIN_EVENT, (event) => {
    const instance = (event as CustomEvent<CartCutinInstance>).detail;
    if (!instance) return;
    // Phase102 dispatches this after drawing its deterministic fallback bundle.
    // The real supplied portrait replaces it as soon as its tiny data URI is decoded.
    drawActiveExpression(instance);
  });
}

installCartRoguePhase102FaceImages();
