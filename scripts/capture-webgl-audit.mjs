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

async function readGameplayAudit(sessionId) {
  return execute(sessionId, `
    const canvas = document.querySelector('canvas.cart-rogue-canvas');
    if (!canvas) return null;
    canvas.dispatchEvent(new Event('cart-render-audit-request'));
    canvas.dispatchEvent(new Event('cart-gameplay-audit-request'));
    try {
      return canvas.dataset.cartGameplayAudit ? JSON.parse(canvas.dataset.cartGameplayAudit) : null;
    } catch {
      return { ok: false, issues: ['gameplay audit payload is invalid JSON'] };
    }
  `);
}

async function setAuditKeys(sessionId, down, keepThrottle = false) {
  await execute(sessionId, `
    const driveType = arguments[0] ? 'keydown' : 'keyup';
    const throttleType = (arguments[0] || arguments[1]) ? 'keydown' : 'keyup';
    window.dispatchEvent(new KeyboardEvent(driveType, { key: 'Shift', code: 'ShiftLeft', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent(driveType, { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent(throttleType, { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true }));
    return true;
  `, [down, keepThrottle]);
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
      if (!canvas) return { ready: false, badge, stage: Boolean(stage), href: location.href, renderDiagnostics: null, gameplayAudit: null };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      canvas.dispatchEvent(new Event('cart-render-audit-request'));
      canvas.dispatchEvent(new Event('cart-gameplay-audit-request'));
      let renderDiagnostics = null;
      let gameplayAudit = null;
      try {
        renderDiagnostics = canvas.dataset.cartRenderDiagnostics ? JSON.parse(canvas.dataset.cartRenderDiagnostics) : null;
      } catch {
        renderDiagnostics = { ok: false, issues: ['render diagnostics payload is invalid JSON'] };
      }
      try {
        gameplayAudit = canvas.dataset.cartGameplayAudit ? JSON.parse(canvas.dataset.cartGameplayAudit) : null;
      } catch {
        gameplayAudit = { ok: false, issues: ['gameplay audit payload is invalid JSON'] };
      }
      return {
        ready: Boolean(gl) && !gl.isContextLost() && Boolean(stage) && Boolean(renderDiagnostics) && Boolean(gameplayAudit),
        badge,
        webgl: Boolean(gl),
        contextLost: gl ? gl.isContextLost() : null,
        cartStage: Boolean(stage),
        hasGasHud: text.includes('GAS'),
        hasTurboHud: text.includes('TURBO'),
        hasTurboHuntHud: text.includes('TURBO HUNT'),
        hasHuntOrderHud: text.includes('HUNT ORDER'),
        hasHeatHud: text.includes('HEAT'),
        hasKoHud: text.includes('KO'),
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        href: location.href,
        renderDiagnostics,
        gameplayAudit,
      };
    `);
    if (state?.ready
        && state?.badge === "WEBGL"
        && state?.hasGasHud
        && state?.hasTurboHud
        && state?.hasTurboHuntHud
        && state?.hasHuntOrderHud
        && state?.hasHeatHud
        && state?.hasKoHud) break;
    await sleep(250);
  }

  if (!state?.ready || state?.badge !== "WEBGL") {
    throw new Error(`Real Cart Rogue WebGL runtime did not become ready: ${JSON.stringify(state)}`);
  }
  if (!state?.cartStage
      || !state?.hasGasHud
      || !state?.hasTurboHud
      || !state?.hasTurboHuntHud
      || !state?.hasHuntOrderHud
      || !state?.hasHeatHud
      || !state?.hasKoHud) {
    throw new Error(`Turbo Hunt HUD/game shell is incomplete: ${JSON.stringify(state)}`);
  }
  if ((state.width ?? 0) <= 0 || (state.height ?? 0) <= 0) {
    throw new Error(`WebGL canvas has invalid backing size: ${JSON.stringify(state)}`);
  }
  if (!state.renderDiagnostics?.ok) {
    throw new Error(`Cart Rogue render graph audit failed: ${JSON.stringify(state.renderDiagnostics)}`);
  }
  if (!state.gameplayAudit?.ok) {
    throw new Error(`Cart Rogue gameplay baseline audit failed: ${JSON.stringify(state.gameplayAudit)}`);
  }
  if (!state.gameplayAudit?.nodes?.["hunt-field"] || (state.gameplayAudit.nodes["hunt-field"].authoredEnemies ?? 0) < 18) {
    throw new Error(`Turbo Hunt field did not expose its bounded target pool: ${JSON.stringify(state.gameplayAudit)}`);
  }

  // Headless Chrome may advance the fixed-step loop much more slowly than wall
  // clock time. Wait for measured simulation samples, not a guessed 600 ms.
  let gameplayBaseline = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(100);
    const candidate = await readGameplayAudit(sessionId);
    gameplayBaseline = candidate;
    if (candidate?.ok && (candidate.sampleCount ?? 0) >= 5 && (candidate.durationSeconds ?? 0) >= 0.2) break;
  }
  if (!gameplayBaseline?.ok || (gameplayBaseline.sampleCount ?? 0) < 5 || (gameplayBaseline.durationSeconds ?? 0) < 0.2) {
    throw new Error(`Cart Rogue gameplay baseline did not collect enough real frames: ${JSON.stringify(gameplayBaseline)}`);
  }
  state.gameplayBaseline = gameplayBaseline;

  const screenshot = await request(`/session/${sessionId}/screenshot`, { method: "GET" });
  const pngBase64 = screenshot?.value;
  if (typeof pngBase64 !== "string" || pngBase64.length < 100) {
    throw new Error("ChromeDriver screenshot payload is missing");
  }

  // Headless Chrome can advance rAF simulation much more slowly than wall
  // clock time. Hold the real Turbo input until the gameplay/render runtime
  // itself reports the authored READY state instead of releasing after a
  // guessed sleep duration. ArrowUp stays down so release can activate Turbo.
  await setAuditKeys(sessionId, true);
  let dynamicTurboDriftDiagnostics = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await sleep(100);
    const candidate = await readRenderDiagnostics(sessionId);
    if (candidate?.ok
        && candidate.turboAttackFrame?.exists === true
        && candidate.turboAttackFrame?.visible === true
        && candidate.turboAttackMode === "ready"
        && (candidate.turboAttackIntensity ?? 0) >= 0.82
        && (candidate.stationaryTurboSkidActiveCount ?? 0) >= 2
        && Math.abs(candidate.heroPresentationRoll ?? 0) >= 0.015) {
      dynamicTurboDriftDiagnostics = candidate;
      break;
    }
  }
  if (!dynamicTurboDriftDiagnostics?.ok) {
    throw new Error(`Turbo 2.0 did not reach its real READY state in WebGL: ${JSON.stringify(dynamicTurboDriftDiagnostics)}`);
  }
  const dynamicGameplayAudit = await readGameplayAudit(sessionId);
  if (!dynamicGameplayAudit?.ok) {
    throw new Error(`Dynamic Cart Rogue gameplay audit failed: ${JSON.stringify(dynamicGameplayAudit)}`);
  }
  const turboRequestedDelta = (dynamicGameplayAudit.turboRequestedSeconds ?? 0) - (gameplayBaseline.turboRequestedSeconds ?? 0);
  if (turboRequestedDelta < 0.05) {
    throw new Error(`Gameplay audit did not observe the real Turbo input: ${JSON.stringify(dynamicGameplayAudit)}`);
  }
  state.dynamicTurboDriftDiagnostics = dynamicTurboDriftDiagnostics;
  state.dynamicGameplayAudit = dynamicGameplayAudit;

  // Releasing Shift is the offensive commit in Turbo 2.0. Keep ArrowUp held
  // for the release frame because RallyCar intentionally requires throttle to
  // consume a Turbo stock. Prefer a live attack sample, but also accept the
  // presentation latch written only after a real WebGL attack frame renders.
  const observedSerialBeforeRelease = dynamicTurboDriftDiagnostics.turboAttackObservedAttackSerial ?? 0;
  await setAuditKeys(sessionId, false, true);
  let releaseTurboAttackDiagnostics = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(35);
    const candidate = await readRenderDiagnostics(sessionId);
    const liveAttack = candidate?.turboAttackMode === "attack"
      && candidate?.turboAttackFrame?.visible === true
      && (candidate?.turboAttackIntensity ?? 0) >= 0.5;
    const latchedAttack = (candidate?.turboAttackObservedAttackSerial ?? 0) > observedSerialBeforeRelease
      && (candidate?.turboAttackPeakIntensity ?? 0) >= 0.5;
    if (liveAttack || latchedAttack) {
      releaseTurboAttackDiagnostics = candidate;
      break;
    }
  }
  await setAuditKeys(sessionId, false, false);
  const releasePeak = Math.max(
    releaseTurboAttackDiagnostics?.turboAttackIntensity ?? 0,
    releaseTurboAttackDiagnostics?.turboAttackPeakIntensity ?? 0,
  );
  if (!releaseTurboAttackDiagnostics || releasePeak < 0.5) {
    throw new Error(`Turbo 2.0 release attack frame was not observed: ${JSON.stringify(releaseTurboAttackDiagnostics)}`);
  }
  state.releaseTurboAttackDiagnostics = releaseTurboAttackDiagnostics;

  await mkdir(new URL("../artifacts/webgl-audit/", import.meta.url), { recursive: true });
  await mkdir(new URL(`../${output.split("/").slice(0, -1).join("/")}/`, import.meta.url), { recursive: true }).catch(() => undefined);
  await writeFile(new URL(`../${output}`, import.meta.url), Buffer.from(pngBase64, "base64"));
  await writeFile(new URL(`../${stateOutput}`, import.meta.url), `${JSON.stringify(state, null, 2)}\n`);
  console.log(`Real Cart Rogue Turbo Hunt WebGL audit passed: ${JSON.stringify(state)}`);
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
