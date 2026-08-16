import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const driverBin = process.env.WEBDRIVER_BIN || "chromedriver";
const driverPort = Number(process.env.WEBDRIVER_PORT || 9515);
const driverUrl = `http://127.0.0.1:${driverPort}`;
const auditUrl = process.env.AUDIT_URL || "http://127.0.0.1:3000/";
const output = process.env.AUDIT_OUTPUT || "artifacts/webgl-audit/cart-rogue-webgl.png";
const stateOutput = process.env.AUDIT_STATE_OUTPUT || "artifacts/webgl-audit/runtime-state.json";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const response = await fetch(`${driverUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`WebDriver ${path} failed: ${response.status} ${text}`);
  return body;
}

async function waitForDriver() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const status = await request("/status", { method: "GET" });
      if (status?.value?.ready !== false) return;
    } catch {
      // Driver is still starting.
    }
    await sleep(250);
  }
  throw new Error("ChromeDriver did not become ready");
}

async function execute(sessionId, script, args = []) {
  const result = await request(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: JSON.stringify({ script, args }),
  });
  return result?.value;
}

async function readRenderDiagnostics(sessionId) {
  return execute(sessionId, `
    const canvas = document.querySelector('canvas.cart-rogue-canvas');
    if (!canvas) return null;
    canvas.dispatchEvent(new Event('cart-render-audit-request'));
    try {
      return canvas.dataset.cartRenderDiagnostics ? JSON.parse(canvas.dataset.cartRenderDiagnostics) : null;
    } catch {
      return { ok: false, issues: ['render diagnostics payload is invalid JSON'] };
    }
  `);
}

async function setAuditKeys(sessionId, down) {
  await execute(sessionId, `
    const type = arguments[0] ? 'keydown' : 'keyup';
    window.dispatchEvent(new KeyboardEvent(type, { key: 'Shift', code: 'ShiftLeft', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent(type, { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
    return true;
  `, [down]);
}

const driver = spawn(driverBin, [`--port=${driverPort}`, "--allowed-origins=*"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let driverLog = "";
driver.stdout.on("data", (chunk) => { driverLog += chunk.toString(); });
driver.stderr.on("data", (chunk) => { driverLog += chunk.toString(); });

let sessionId = null;
try {
  await waitForDriver();
  const session = await request("/session", {
    method: "POST",
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: [
              "--headless=new",
              "--no-sandbox",
              "--disable-dev-shm-usage",
              "--ignore-gpu-blocklist",
              "--enable-webgl",
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--window-size=844,390",
            ],
          },
        },
      },
    }),
  });
  sessionId = session?.value?.sessionId || session?.sessionId;
  if (!sessionId) throw new Error(`ChromeDriver session id missing: ${JSON.stringify(session)}`);

  await request(`/session/${sessionId}/url`, {
    method: "POST",
    body: JSON.stringify({ url: auditUrl }),
  });

  let state = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    state = await execute(sessionId, `
      const canvas = document.querySelector('canvas.cart-rogue-canvas');
      const stage = document.querySelector('section[aria-label="Cart Rogue game"]');
      const text = document.body.innerText || '';
      const badge = Array.from(document.querySelectorAll('span')).map((el) => el.textContent?.trim()).find((value) => value === 'WEBGL' || value === 'CANVAS') || '';
      if (!canvas) return { ready: false, badge, stage: Boolean(stage), href: location.href, renderDiagnostics: null };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      let renderDiagnostics = null;
      try {
        renderDiagnostics = canvas.dataset.cartRenderDiagnostics ? JSON.parse(canvas.dataset.cartRenderDiagnostics) : null;
      } catch {
        renderDiagnostics = { ok: false, issues: ['render diagnostics payload is invalid JSON'] };
      }
      return {
        ready: Boolean(gl) && !gl.isContextLost() && Boolean(stage) && Boolean(renderDiagnostics),
        badge,
        webgl: Boolean(gl),
        contextLost: gl ? gl.isContextLost() : null,
        cartStage: Boolean(stage),
        hasGasHud: text.includes('GAS'),
        hasTurboHud: text.includes('TURBO'),
        hasEnemyHud: text.includes('ENEMIES'),
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        href: location.href,
        renderDiagnostics,
      };
    `);
    if (state?.ready && state?.badge === "WEBGL" && state?.hasGasHud && state?.hasTurboHud && state?.hasEnemyHud) break;
    await sleep(250);
  }

  if (!state?.ready || state?.badge !== "WEBGL") {
    throw new Error(`Real Cart Rogue WebGL runtime did not become ready: ${JSON.stringify(state)}`);
  }
  if (!state?.cartStage || !state?.hasGasHud || !state?.hasTurboHud || !state?.hasEnemyHud) {
    throw new Error(`Cart Rogue HUD/game shell is incomplete: ${JSON.stringify(state)}`);
  }
  if ((state.width ?? 0) <= 0 || (state.height ?? 0) <= 0) {
    throw new Error(`WebGL canvas has invalid backing size: ${JSON.stringify(state)}`);
  }
  if (!state.renderDiagnostics?.ok) {
    throw new Error(`Cart Rogue render graph audit failed: ${JSON.stringify(state.renderDiagnostics)}`);
  }

  // Preserve the normal initial frame as the visual comparison artifact.
  await sleep(600);
  const screenshot = await request(`/session/${sessionId}/screenshot`, { method: "GET" });
  const pngBase64 = screenshot?.value;
  if (typeof pngBase64 !== "string" || pngBase64.length < 100) {
    throw new Error("ChromeDriver screenshot payload is missing");
  }

  // Exercise the dynamic Turbo-drift presentation instead of only checking that
  // its meshes exist. Hold Turbo + steer, refresh the scene diagnostics, then
  // require both stamped skid instances and visible body roll.
  await setAuditKeys(sessionId, true);
  await sleep(520);
  const dynamicTurboDriftDiagnostics = await readRenderDiagnostics(sessionId);
  await setAuditKeys(sessionId, false);
  if (!dynamicTurboDriftDiagnostics?.ok) {
    throw new Error(`Dynamic Cart Rogue render graph audit failed: ${JSON.stringify(dynamicTurboDriftDiagnostics)}`);
  }
  if ((dynamicTurboDriftDiagnostics.stationaryTurboSkidActiveCount ?? 0) < 2) {
    throw new Error(`Turbo drift did not stamp visible skid instances: ${JSON.stringify(dynamicTurboDriftDiagnostics)}`);
  }
  if (Math.abs(dynamicTurboDriftDiagnostics.heroPresentationRoll ?? 0) < 0.015) {
    throw new Error(`Turbo drift did not produce visible hero body roll: ${JSON.stringify(dynamicTurboDriftDiagnostics)}`);
  }
  state.dynamicTurboDriftDiagnostics = dynamicTurboDriftDiagnostics;

  await mkdir(new URL("../artifacts/webgl-audit/", import.meta.url), { recursive: true });
  await mkdir(new URL(`../${output.split("/").slice(0, -1).join("/")}/`, import.meta.url), { recursive: true }).catch(() => undefined);
  await writeFile(new URL(`../${output}`, import.meta.url), Buffer.from(pngBase64, "base64"));
  await writeFile(new URL(`../${stateOutput}`, import.meta.url), `${JSON.stringify(state, null, 2)}\n`);
  console.log(`Real Cart Rogue WebGL audit passed: ${JSON.stringify(state)}`);
} catch (error) {
  console.error(error);
  if (driverLog) console.error(driverLog);
  process.exitCode = 1;
} finally {
  if (sessionId) {
    try { await request(`/session/${sessionId}`, { method: "DELETE" }); } catch { /* best effort */ }
  }
  driver.kill("SIGTERM");
}
