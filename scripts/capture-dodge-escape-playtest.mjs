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
    const body = document.body;
    const text = body ? (body.innerText || '') : '';
    const canvas = document.querySelector('canvas.cart-rogue-canvas');
    const escape = document.querySelector('[aria-label="Escape rhythm status"]');
    const damage = document.querySelector('[aria-label="Damage taken"]');
    const gas = text.match(/GAS\\s+(\\d+)%/);
    return {
      ready: Boolean(body) && Boolean(canvas) && text.includes('TURBO HUNT'),
      hazard: /AOE (TRACKING|LOCKED|FIRING|IMPACT)/.test(text),
      locked: text.includes('AOE LOCKED') && text.includes('LOCKED INTERCEPT'),
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
    reactionsCompleted: 0,
    escapeEpisodes: 0,
    firstEscapeSeconds: null,
    gasSamples: [],
  };
}

async function runScenario(sessionId, mode, maxSeconds) {
  const metrics = createMetrics(mode);
  const started = Date.now();
  let previousHazard = false;
  let previousHit = false;
  let previousPerfect = false;
  let previousEscape = false;
  let reactionActive = false;
  let reactionDirection = 1;
  let currentState = null;

  // Cart Rogue auto-accelerates in the live runtime. The passive run never
  // changes line. The reactive run starts a full steering + brake maneuver
  // only after the Phase93 LOCKED INTERCEPT is visibly committed, and holds it
  // until that AOE resolves. This is event-driven rather than wall-clock-driven
  // so headless SwiftShader speed cannot shorten the actual gameplay reaction.
  try {
    while (Date.now() - started < maxSeconds * 1000) {
      currentState = await sample(sessionId);
      if (!currentState.ready) throw new Error(`playtest runtime lost: ${JSON.stringify(currentState)}`);
      metrics.samples += 1;
      metrics.durationSeconds = (Date.now() - started) / 1000;
      if (currentState.hazard) metrics.hazardActiveMs += 65;
      if (currentState.hazard && !previousHazard) metrics.hazardEpisodes += 1;
      if (currentState.directHit && !previousHit) metrics.hits += 1;
      if (currentState.perfect && !previousPerfect) metrics.perfectDodges += 1;
      if (currentState.escape && !previousEscape) {
        metrics.escapeEpisodes += 1;
        if (metrics.firstEscapeSeconds === null) metrics.firstEscapeSeconds = metrics.durationSeconds;
      }
      if (currentState.gas !== null) metrics.gasSamples.push(currentState.gas);

      if (mode === "reactive" && currentState.locked && !reactionActive) {
        reactionDirection *= -1;
        await key(sessionId, reactionDirection < 0 ? "ArrowLeft" : "ArrowRight", true);
        await key(sessionId, "ArrowDown", true);
        reactionActive = true;
        metrics.steerActions += 1;
        metrics.brakeActions += 1;
      }

      if (reactionActive && (currentState.directHit || currentState.perfect || (!currentState.hazard && previousHazard))) {
        await key(sessionId, reactionDirection < 0 ? "ArrowLeft" : "ArrowRight", false);
        await key(sessionId, "ArrowDown", false);
        reactionActive = false;
        metrics.reactionsCompleted += 1;
      }

      previousHazard = currentState.hazard;
      previousHit = currentState.directHit;
      previousPerfect = currentState.perfect;
      previousEscape = currentState.escape;

      if (mode === "passive" && metrics.hits >= 1) break;
      if (mode === "reactive" && metrics.reactionsCompleted >= 2 && !currentState.hazard && !reactionActive) break;
      await sleep(65);
    }
  } finally {
    if (reactionActive) {
      await key(sessionId, reactionDirection < 0 ? "ArrowLeft" : "ArrowRight", false);
      await key(sessionId, "ArrowDown", false);
    }
  }

  metrics.hazardActiveRatio = metrics.durationSeconds > 0 ? metrics.hazardActiveMs / (metrics.durationSeconds * 1000) : 0;
  metrics.startGas = metrics.gasSamples[0] ?? null;
  metrics.endGas = metrics.gasSamples.at(-1) ?? null;
  metrics.minGas = metrics.gasSamples.length ? Math.min(...metrics.gasSamples) : null;
  metrics.lastState = currentState;
  delete metrics.gasSamples;
  return metrics;
}

async function waitForEscape(sessionId, timeoutSeconds) {
  const started = Date.now();
  let lastState = null;
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
  const passive = await runScenario(sessionId, "passive", 110);
  await fresh();
  const reactive = await runScenario(sessionId, "reactive", 110);

  let escapeObservation = null;
  if (passive.escapeEpisodes > 0 || reactive.escapeEpisodes > 0) {
    const source = passive.escapeEpisodes > 0 ? passive : reactive;
    escapeObservation = {
      observed: true,
      wallSeconds: source.firstEscapeSeconds,
      text: "ESCAPE rendered during gameplay comparison",
      textSample: source.lastState?.textSample ?? [],
    };
  } else {
    await fresh();
    escapeObservation = await waitForEscape(sessionId, 90);
  }
  const finalState = await sample(sessionId);

  const summary = {
    viewport: { width: finalState.width, height: finalState.height },
    passive,
    reactive,
    escapeObservation,
    acceptance: {
      passiveWasPunished: passive.hits >= 1,
      reactiveUsedEvasion: reactive.steerActions >= 1 && reactive.brakeActions >= 1 && reactive.reactionsCompleted >= 1,
      reactivePerfectlyDodged: reactive.perfectDodges >= 1,
      reactiveAvoidedForcedHits: reactive.hits === 0,
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
