import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const driverBin = process.env.WEBDRIVER_BIN || "chromedriver";
const driverPort = Number(process.env.DODGE_ESCAPE_WEBDRIVER_PORT || 9523);
const driverUrl = `http://127.0.0.1:${driverPort}`;
const auditUrl = process.env.AUDIT_URL || "http://127.0.0.1:3000/";
const stateOutput = process.env.DODGE_ESCAPE_STATE_OUTPUT || "artifacts/webgl-audit/dodge-escape-playtest.json";
const screenshotOutput = process.env.DODGE_ESCAPE_SCREENSHOT_OUTPUT || "artifacts/webgl-audit/cart-rogue-dodge-escape-playtest.png";
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

async function key(sessionId, keyName, down) {
  const code = keyName === " " ? "Space" : keyName;
  await execute(sessionId, `
    window.dispatchEvent(new KeyboardEvent(arguments[0], {
      key: arguments[1], code: arguments[2], bubbles: true, cancelable: true,
    }));
    return true;
  `, [down ? "keydown" : "keyup", keyName, code]);
}

async function sample(sessionId) {
  return execute(sessionId, `
    const text = document.body.innerText || '';
    const canvas = document.querySelector('canvas.cart-rogue-canvas');
    const escape = document.querySelector('[aria-label="Escape rhythm status"]');
    const damage = document.querySelector('[aria-label="Damage taken"]');
    const gas = text.match(/GAS\\s+(\\d+)%/);
    return {
      ready: Boolean(canvas) && text.includes('TURBO HUNT'),
      hazard: /AOE (TRACKING|LOCKED|FIRING|IMPACT)/.test(text),
      locked: text.includes('AOE LOCKED'),
      firing: text.includes('AOE FIRING'),
      directHit: Boolean(damage) && text.includes('DIRECT HIT'),
      perfect: text.includes('PERFECT AOE DODGE'),
      escape: Boolean(escape),
      escapeText: escape ? escape.textContent : '',
      gas: gas ? Number(gas[1]) : null,
      width: canvas?.clientWidth || 0,
      height: canvas?.clientHeight || 0,
      textSample: text.split('\\n').filter(Boolean).slice(0, 32),
    };
  `);
}

function createMetrics(label) {
  return {
    label,
    durationSeconds: 0,
    samples: 0,
    hazardEpisodes: 0,
    hazardActiveMs: 0,
    hits: 0,
    perfectDodges: 0,
    steerActions: 0,
    brakeActions: 0,
    gasSamples: [],
  };
}

async function runScenario(sessionId, mode, seconds) {
  const metrics = createMetrics(mode);
  const started = Date.now();
  let previousHazard = false;
  let previousHit = false;
  let previousPerfect = false;
  let steering = 0;
  let steerReleaseAt = 0;
  let brakeReleaseAt = 0;
  let braking = false;
  let direction = 1;
  let lastReactionAt = 0;

  // Both scenarios continuously accelerate. The reactive run deliberately
  // changes line AND briefly brakes at each AOE LOCK; the passive run does
  // neither. This models the clear driving decision the game is supposed to teach.
  await key(sessionId, "ArrowUp", true);
  try {
    while (Date.now() - started < seconds * 1000) {
      const now = Date.now();
      const state = await sample(sessionId);
      if (!state.ready) throw new Error(`playtest runtime lost: ${JSON.stringify(state)}`);
      metrics.samples += 1;
      metrics.durationSeconds = (now - started) / 1000;
      if (state.hazard) metrics.hazardActiveMs += 55;
      if (state.hazard && !previousHazard) metrics.hazardEpisodes += 1;
      if (state.directHit && !previousHit) metrics.hits += 1;
      if (state.perfect && !previousPerfect) metrics.perfectDodges += 1;
      if (state.gas !== null) metrics.gasSamples.push(state.gas);

      if (mode === "reactive" && state.locked && now - lastReactionAt > 650) {
        direction *= -1;
        steering = direction;
        await key(sessionId, direction < 0 ? "ArrowLeft" : "ArrowRight", true);
        await key(sessionId, "ArrowDown", true);
        braking = true;
        steerReleaseAt = now + 980;
        brakeReleaseAt = now + 390;
        metrics.steerActions += 1;
        metrics.brakeActions += 1;
        lastReactionAt = now;
      }
      if (steering !== 0 && now >= steerReleaseAt) {
        await key(sessionId, steering < 0 ? "ArrowLeft" : "ArrowRight", false);
        steering = 0;
      }
      if (braking && now >= brakeReleaseAt) {
        await key(sessionId, "ArrowDown", false);
        braking = false;
      }

      previousHazard = state.hazard;
      previousHit = state.directHit;
      previousPerfect = state.perfect;
      await sleep(55);
    }
  } finally {
    await key(sessionId, "ArrowUp", false);
    if (steering !== 0) await key(sessionId, steering < 0 ? "ArrowLeft" : "ArrowRight", false);
    if (braking) await key(sessionId, "ArrowDown", false);
  }

  metrics.hazardActiveRatio = metrics.durationSeconds > 0 ? metrics.hazardActiveMs / (metrics.durationSeconds * 1000) : 0;
  metrics.startGas = metrics.gasSamples[0] ?? null;
  metrics.endGas = metrics.gasSamples.at(-1) ?? null;
  metrics.minGas = metrics.gasSamples.length ? Math.min(...metrics.gasSamples) : null;
  delete metrics.gasSamples;
  return metrics;
}

async function waitForEscape(sessionId, timeoutSeconds) {
  const started = Date.now();
  let lastState = null;
  await key(sessionId, "ArrowUp", true);
  try {
    while (Date.now() - started < timeoutSeconds * 1000) {
      lastState = await sample(sessionId);
      if (!lastState?.ready) throw new Error(`escape observation runtime lost: ${JSON.stringify(lastState)}`);
      if (lastState.escape) {
        return {
          observed: true,
          wallSeconds: (Date.now() - started) / 1000,
          text: lastState.escapeText,
          textSample: lastState.textSample,
        };
      }
      await sleep(75);
    }
  } finally {
    await key(sessionId, "ArrowUp", false);
  }
  return {
    observed: false,
    wallSeconds: (Date.now() - started) / 1000,
    text: lastState?.escapeText ?? "",
    textSample: lastState?.textSample ?? [],
  };
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
  if (!sessionId) throw new Error("ChromeDriver session id missing");

  async function fresh() {
    await request(`/session/${sessionId}/url`, {
      method: "POST",
      body: JSON.stringify({ url: `${auditUrl}?dodgeEscape=${Date.now()}` }),
    });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const state = await sample(sessionId);
      if (state.ready) return state;
      await sleep(100);
    }
    throw new Error("dodge/escape playtest runtime did not become ready");
  }

  await fresh();
  const passive = await runScenario(sessionId, "passive-straight", 21);
  await fresh();
  const reactive = await runScenario(sessionId, "reactive-steer-brake", 21);

  // Headless SwiftShader can advance gameplay fixed steps much slower than wall
  // clock time. Unit regression fixes ESCAPE at 6.2 game seconds; this separate
  // production check only proves that the real WebGL/React presentation appears.
  await fresh();
  const escapeObservation = await waitForEscape(sessionId, 90);
  const finalState = await sample(sessionId);

  const summary = {
    viewport: { width: finalState.width, height: finalState.height },
    passive,
    reactive,
    escapeObservation,
    acceptance: {
      passiveWasPunished: passive.hits >= 1,
      reactiveUsedEvasion: reactive.steerActions >= 2 && reactive.brakeActions >= 2,
      reactiveImprovedOverPassive: reactive.hits < passive.hits,
      escapeRendered: escapeObservation.observed,
    },
    finalTextSample: finalState.textSample,
  };

  const failed = Object.entries(summary.acceptance).filter(([, value]) => !value).map(([key]) => key);
  if (failed.length > 0) throw new Error(`dodge/escape gameplay acceptance failed: ${failed.join(', ')} ${JSON.stringify(summary)}`);

  const screenshot = await request(`/session/${sessionId}/screenshot`, { method: "GET" });
  if (typeof screenshot?.value !== "string" || screenshot.value.length < 100) throw new Error("playtest screenshot missing");
  await mkdir(new URL("../artifacts/webgl-audit/", import.meta.url), { recursive: true });
  await writeFile(new URL(`../${stateOutput}`, import.meta.url), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(new URL(`../${screenshotOutput}`, import.meta.url), Buffer.from(screenshot.value, "base64"));
  console.log(`Dodge / escape playtest passed: ${JSON.stringify(summary)}`);
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
