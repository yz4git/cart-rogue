import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const driverBin = process.env.WEBDRIVER_BIN || "chromedriver";
const driverPort = Number(process.env.RAID_DAMAGE_WEBDRIVER_PORT || 9519);
const driverUrl = `http://127.0.0.1:${driverPort}`;
const auditUrl = process.env.AUDIT_URL || "http://127.0.0.1:3000/";
const output = process.env.RAID_DAMAGE_AUDIT_OUTPUT || "artifacts/webgl-audit/cart-rogue-raid-damage.png";
const stateOutput = process.env.RAID_DAMAGE_AUDIT_STATE_OUTPUT || "artifacts/webgl-audit/raid-damage-state.json";
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

  await request(`/session/${sessionId}/url`, {
    method: "POST",
    body: JSON.stringify({ url: auditUrl }),
  });

  let ready = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    ready = await execute(sessionId, `
      const canvas = document.querySelector('canvas.cart-rogue-canvas');
      const text = document.body.innerText || '';
      if (!canvas) return { ready: false, text: text.slice(0, 500) };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return {
        ready: Boolean(gl) && !gl.isContextLost() && text.includes('TURBO HUNT'),
        webgl: Boolean(gl),
        contextLost: gl ? gl.isContextLost() : null,
        hasTurboHunt: text.includes('TURBO HUNT'),
      };
    `);
    if (ready?.ready) break;
    await sleep(100);
  }
  if (!ready?.ready) throw new Error(`Raid damage audit runtime did not become ready: ${JSON.stringify(ready)}`);

  // Prove the gameplay request directly: hold a straight accelerating line and
  // do not steer or brake. Predictive AOEs should intercept this path instead
  // of allowing the car to pass through safely by doing nothing.
  await execute(sessionId, `
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true }));
    return true;
  `);

  let state = null;
  for (let attempt = 0; attempt < 700; attempt += 1) {
    state = await execute(sessionId, `
      const canvas = document.querySelector('canvas.cart-rogue-canvas');
      const text = document.body.innerText || '';
      const overlay = document.querySelector('[aria-label="Damage taken"]');
      if (!canvas) return { ready: false, directHit: false };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const directHit = Boolean(overlay) && text.includes('DIRECT HIT') && text.includes('GAS -8%') && text.includes('SPEED -42%');
      const aoeWarning = text.includes('AOE TRACKING') || text.includes('AOE LOCKED') || text.includes('AOE FIRING');
      return {
        ready: Boolean(gl) && !gl.isContextLost(),
        directHit,
        aoeWarning,
        overlayVisible: Boolean(overlay),
        hasGasLoss: text.includes('GAS -8%'),
        hasSpeedLoss: text.includes('SPEED -42%'),
        textSample: text.split('\\n').filter(Boolean).slice(0, 30),
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      };
    `);
    if (state?.ready && state?.directHit) break;
    await sleep(35);
  }

  await execute(sessionId, `
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true }));
    return true;
  `);

  if (!state?.ready || !state?.directHit || !state?.overlayVisible) {
    throw new Error(`Straight-line raid hit did not produce visible damage feedback: ${JSON.stringify(state)}`);
  }

  const screenshot = await request(`/session/${sessionId}/screenshot`, { method: "GET" });
  const pngBase64 = screenshot?.value;
  if (typeof pngBase64 !== "string" || pngBase64.length < 100) throw new Error("Raid damage screenshot payload missing");

  await mkdir(new URL("../artifacts/webgl-audit/", import.meta.url), { recursive: true });
  await writeFile(new URL(`../${output}`, import.meta.url), Buffer.from(pngBase64, "base64"));
  await writeFile(new URL(`../${stateOutput}`, import.meta.url), `${JSON.stringify(state, null, 2)}\n`);
  console.log(`Straight-line raid damage feedback observed: ${JSON.stringify(state)}`);
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
