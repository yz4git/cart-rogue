import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_DRIVER_PORTRAIT_BASE64,
  CART_OPERATOR_PORTRAIT_BASE64,
  CART_PHASE102_FACE_EXPRESSIONS,
  CART_PHASE102_FACE_IMAGE_META,
  CART_PHASE102_FACE_RASTER_PROFILES,
} from "../src/cart/CartRoguePhase102FaceImages";

const faceImageSource = readFileSync(new URL("../src/cart/CartRoguePhase102FaceImages.ts", import.meta.url), "utf8");
const auditRuntimeSource = readFileSync(new URL("../src/cart/CartGameplayAuditRuntime.ts", import.meta.url), "utf8");

function sha256Base64Image(base64: string): string {
  return createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
}

test("Phase102 preserves the two supplied Face Editor portraits without transfer corruption", () => {
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
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.browStyle, "bold");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.driver.mouthStyle, "frown");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.baseStyle, "female");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.hairStyle, "wavy");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.faceShape, "round");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.eyeStyle, "side-glance");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.browStyle, "raised");
  assert.equal(CART_PHASE102_FACE_IMAGE_META.operator.mouthStyle, "smile");
});

test("Phase102 carries the exact Face Editor Expression System v1 preset contract", () => {
  assert.deepEqual(Object.keys(CART_PHASE102_FACE_EXPRESSIONS), [
    "neutral", "smile", "happy", "angry", "sad", "surprised", "serious", "blink",
  ]);
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.smile.mouthStyle, "smile");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.happy.eyeStyle, "soft");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.happy.browStyle, "arched");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.happy.mouthStyle, "smile-open");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.angry.eyeStyle, "determined");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.angry.browStyle, "angled");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.angry.transforms?.brows?.rotation, 0.075);
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.sad.eyeStyle, "sleepy");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.sad.browStyle, "worried");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.surprised.eyeStyle, "round");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.surprised.transforms?.eyes?.scaleY, 1.1);
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.serious.mouthStyle, "neutral");
  assert.equal(CART_PHASE102_FACE_EXPRESSIONS.blink.eyeStyle, "closed");
});

test("real portrait feature profiles stay bounded to the Phase102 320x220 cut-in canvas", () => {
  for (const profile of Object.values(CART_PHASE102_FACE_RASTER_PROFILES)) {
    assert.ok(profile.pixelsPerUnit > 70 && profile.pixelsPerUnit < 100);
    for (const box of [profile.leftEye, profile.rightEye, profile.leftBrow, profile.rightBrow, profile.mouthBox]) {
      assert.ok(box.x >= 0 && box.y >= 0);
      assert.ok(box.width > 0 && box.height > 0);
      assert.ok(box.x + box.width <= 320);
      assert.ok(box.y + box.height <= 220);
    }
  }
});

test("cut-in events apply expressions to the supplied real portraits instead of registering one image for every expression", () => {
  assert.match(faceImageSource, /renderCartPhase102ExpressionPortrait/);
  assert.match(faceImageSource, /window\.addEventListener\(CART_ANIME_CUTIN_EVENT/);
  assert.match(faceImageSource, /preset\.eyeStyle === "closed"/);
  assert.match(faceImageSource, /drawMouthStyle/);
  assert.doesNotMatch(faceImageSource, /registerCartCutinImagePortrait/);
  assert.match(faceImageSource, /data:image\/webp;base64/);
  assert.match(auditRuntimeSource, /import "\.\/CartRoguePhase102FaceImages";/);
});
