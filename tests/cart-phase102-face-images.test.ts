import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_DRIVER_PORTRAIT_BASE64,
  CART_OPERATOR_PORTRAIT_BASE64,
  CART_PHASE102_FACE_IMAGE_META,
} from "../src/cart/CartRoguePhase102FaceImages";

const faceImageSource = readFileSync(new URL("../src/cart/CartRoguePhase102FaceImages.ts", import.meta.url), "utf8");
const auditRuntimeSource = readFileSync(new URL("../src/cart/CartGameplayAuditRuntime.ts", import.meta.url), "utf8");

function sha256Base64Image(base64: string): string {
  return createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
}

test("Phase102 embeds the two supplied Face Editor portraits without transfer corruption", () => {
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.sourceFormat, "face-editor-polygon-character");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.sourceFormat, "face-editor-polygon-character");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.sourceSha256, "ff60e3c3d93f8e421003a7474962aca8ee0739ec68cba7becd9dbff74cadc0a1");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.sourceSha256, "ca0a8b8e0e6823a0056bad8738612d0b8e02d260852575fa3c42438584cc1a99");
  assert.equal(sha256Base64Image(CART_DRIVER_PORTRAIT_BASE64), CART_PHASE102_FACE_IMAGE_META.driver.portraitSha256);
  assert.equal(sha256Base64Image(CART_OPERATOR_PORTRAIT_BASE64), CART_PHASE102_FACE_IMAGE_META.operator.portraitSha256);
  assert.ok(CART_DRIVER_PORTRAIT_BASE64.length > 3000);
  assert.ok(CART_OPERATOR_PORTRAIT_BASE64.length > 4000);
});

test("the supplied character identities are preserved in Phase102 metadata", () => {
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.baseStyle, "male");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.hairStyle, "twin-tail");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.faceShape, "diamond");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.eyeStyle, "round");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.mouthStyle, "frown");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.baseStyle, "female");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.hairStyle, "wavy");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.faceShape, "round");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.eyeStyle, "side-glance");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.mouthStyle, "smile");
});

test("all Phase102 expressions resolve to the supplied real portrait images", () => {
  assert.match(faceImageSource, /registerCartCutinImagePortrait\("driver", expression, driver\)/);
  assert.match(faceImageSource, /registerCartCutinImagePortrait\("operator", expression, operator\)/);
  assert.match(faceImageSource, /data:image\/webp;base64/);
  assert.match(auditRuntimeSource, /import "\.\/CartRoguePhase102FaceImages";/);
});
