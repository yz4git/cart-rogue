import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const driverBin = process.env.WEBDRIVER_BIN || "chromedriver";
const driverPort = Number(process.env.RAID_WEBDRIVER_PORT || 9517);
const driverUrl = `http://127.0.0.1:${driverPort}`;
const auditUrl = process.env.AUDIT_URL || "http://127.0.0.1:3000/";
const output = process.env.RAID_AUDIT_OUTPUT || "artifacts/webgl-audit/cart-rogue-raid-hazard.png";
const stateOutput = process.env.RAID_AUDIT_STATE_OUTPUT || "artifacts/webgl-audit/raid-hazard-state.json";
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
      // starting
    }
    await sleep(250);
  }
  throw new Error("ChromeDriver did not become ready");
}

async function execute(sessionId, script) {
  const result = await request(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: JSON.stringify({ script, args: [] }),
  });
  return result?.value;
}

const driver = spawn(driverBin, [`--port=${driverPort}`, "--allowed-origins=*"], { stdio: ["ignore", "pipe", "pipe"] });
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

  await request(`/session/${sessionId}/url`, { method: "POST", body: JSON.stringify({ url: auditUrl }) });
  await execute(sessionId, `
    window.__cartPhase106AuditBeats = [];
    window.__cartPhase106AuditLatest = null;
    window.addEventListener('cart-encounter-director2-snapshot', (event) => {
      const detail = event && event.detail ? event.detail : null;
      if (!detail) return;
      window.__cartPhase106AuditLatest = {
        beat: detail.beat,
        beatSerial: detail.beatSerial,
        reason: detail.reason,
        secondsRemaining: detail.secondsRemaining,
        fieldHazardsAllowed: detail.fieldHazardsAllowed,
        raidActiveCount: detail.raidActiveCount,
        transitionCount: detail.transitionCount,
      };
      const beats = window.__cartPhase106AuditBeats;
      const last = beats.length > 0 ? beats[beats.length - 1] : null;
      if (!last || last.beatSerial !== detail.beatSerial || last.beat !== detail.beat) {
        beats.push({ ...window.__cartPhase106AuditLatest });
        if (beats.length > 32) beats.shift();
      }
    });
  `);

  let state = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    state = await execute(sessionId, `
      const canvas = document.querySelector('canvas.cart-rogue-canvas');
      const text = document.body.innerText || '';
      if (!canvas) return { ready: false, text: text.slice(0, 800), encounterBeats: window.__cartPhase106AuditBeats || [], encounterLatest: window.__cartPhase106AuditLatest || null };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const lines = text.split(String.fromCharCode(10)).map((line) => line.trim());
      const aoeLine = lines.find((line) => line.startsWith('AOE TRACKING') || line.startsWith('AOE LOCKED') || line.startsWith('AOE FIRING') || line.startsWith('AOE IMPACT')) || null;
      return {
        ready: Boolean(gl) && !gl.isContextLost() && text.includes('TURBO HUNT'),
        webgl: Boolean(gl),
        contextLost: gl ? gl.isContextLost() : null,
        aoeLine,
        redWarning: aoeLine !== null,
        hasTurboHunt: text.includes('TURBO HUNT'),
        hasGas: text.includes('GAS'),
        hasTurbo: text.includes('TURBO'),
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        encounterBeats: window.__cartPhase106AuditBeats || [],
        encounterLatest: window.__cartPhase106AuditLatest || null,
      };
    `);
    if (state?.ready && state?.redWarning) break;
    await sleep(125);
  }

  if (!state?.ready || !state?.redWarning || !state?.aoeLine) {
    throw new Error(`Raid hazard did not become visibly telegraphed: ${JSON.stringify(state)}`);
  }

  const screenshot = await request(`/session/${sessionId}/screenshot`, { method: "GET" });
  const pngBase64 = screenshot?.value;
  if (typeof pngBase64 !== "string" || pngBase64.length < 100) throw new Error("Raid screenshot payload missing");

  await mkdir(new URL("../artifacts/webgl-audit/", import.meta.url), { recursive: true });
  await writeFile(new URL(`../${output}`, import.meta.url), Buffer.from(pngBase64, "base64"));
  await writeFile(new URL(`../${stateOutput}`, import.meta.url), `${JSON.stringify(state, null, 2)}\n`);
  console.log(`Raid hazard WebGL telegraph observed: ${JSON.stringify(state)}`);
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
