import {
  registerCartCutinImagePortrait,
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
import operator0 from "./data/portraits/operator-0";
import operator1 from "./data/portraits/operator-1";
import operator2 from "./data/portraits/operator-2";

const EXPRESSIONS: readonly CartFaceEditorExpressionId[] = [
  "neutral",
  "smile",
  "happy",
  "angry",
  "sad",
  "surprised",
  "serious",
  "blink",
] as const;

export const CART_DRIVER_PORTRAIT_BASE64 = `${driver00}${driver01}${driver02}${driver03}${driver04}${driver05}${driver06}${driver07}`;
export const CART_OPERATOR_PORTRAIT_BASE64 = `${operator0}${operator1}${operator2}`;

export const CART_PHASE102_FACE_IMAGE_META = {
  driver: {
    sourceSha256: "ff60e3c3d93f8e421003a7474962aca8ee0739ec68cba7becd9dbff74cadc0a1",
    portraitSha256: "ac1c7a9d55bb58781ed8ae72c8b54922ee4c045e9a3a58ae9264188e877072f4",
    sourceFormat: "face-editor-polygon-character",
    baseStyle: "male",
    hairStyle: "twin-tail",
    faceShape: "diamond",
    eyeStyle: "round",
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
    mouthStyle: "smile",
  },
} as const;

function dataUri(base64: string): string {
  return `data:image/webp;base64,${base64}`;
}

export function installCartRoguePhase102FaceImages(): void {
  const driver = dataUri(CART_DRIVER_PORTRAIT_BASE64);
  const operator = dataUri(CART_OPERATOR_PORTRAIT_BASE64);
  for (const expression of EXPRESSIONS) {
    registerCartCutinImagePortrait("driver", expression, driver);
    registerCartCutinImagePortrait("operator", expression, operator);
  }
}

installCartRoguePhase102FaceImages();
