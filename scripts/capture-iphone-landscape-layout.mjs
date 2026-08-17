import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const driverBin = process.env.WEBDRIVER_BIN || "chromedriver";
const driverPort = Number(process.env.IPHONE_AUDIT_DRIVER_PORT || 9516);
const driverUrl = `http://127.0.0.1:${driverPort}`;
const auditUrl = process.env.AUDIT_URL || "http://127.0.0.1:3000/";
const output = process.env.IPHONE_AUDIT_OUTPUT || "artifacts/webgl-audit/cart-rogue-iphone-landscape.png";
const stateOutput = process.env.IPHONE_AUDIT_STATE_OUTPUT || "artifacts/webgl-audit/iphone-landscape-state.json";

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
      // ChromeDriver is still starting.
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    state = await execute(sessionId, `
      const stage = document.querySelector('section[aria-label="Cart Rogue game"]');
      const canvas = document.querySelector('canvas.cart-rogue-canvas');
      const huntHud = document.querySelector('[aria-label="Turbo Hunt status"]');
      if (!stage || !canvas || !huntHud) return { ready: false };

      const stageChildren = Array.from(stage.children);
      const bottomHud = stageChildren.find((element) => {
        const text = element.textContent || '';
        return element.children.length === 3 && text.includes('GAS') && text.includes('TURBO');
      }) || null;
      const controls = stageChildren.find((element) => {
        const buttons = Array.from(element.querySelectorAll(':scope > button'));
        const labels = buttons.map((button) => (button.textContent || '').trim());
        return labels.some((label) => label.includes('BRAKE')) && labels.some((label) => label.includes('TURBO'));
      }) || null;

      const rect = (element) => {
        if (!element) return null;
        const value = element.getBoundingClientRect();
        return { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height };
      };
      const innerWidth = window.innerWidth;
      const innerHeight = window.innerHeight;
      const shell = stage.parentElement;
      const viewport = stage.firstElementChild;
      return {
        ready: Boolean(bottomHud && controls),
        innerWidth,
        innerHeight,
        dpr: window.devicePixelRatio,
        shell: rect(shell),
        stage: rect(stage),
        viewport: rect(viewport),
        canvas: rect(canvas),
        huntHud: rect(huntHud),
        bottomHud: rect(bottomHud),
        controls: rect(controls),
      };
    `);
    if (state?.ready) break;
    await sleep(150);
  }

  if (!state?.ready) throw new Error(`iPhone landscape UI did not become ready: ${JSON.stringify(state)}`);

  const epsilon = 1.5;
  const fitsBottom = (value) => value && value.bottom <= state.innerHeight + epsilon && value.top >= -epsilon;
  const fillsViewport = (value) => value
    && value.top >= -epsilon
    && value.bottom <= state.innerHeight + epsilon
    && Math.abs(value.height - state.innerHeight) <= 2.5;

  if (!fillsViewport(state.shell) || !fillsViewport(state.stage) || !fillsViewport(state.viewport)) {
    throw new Error(`Game shell exceeds the visible landscape viewport: ${JSON.stringify(state)}`);
  }
  if (!fitsBottom(state.canvas) || !fitsBottom(state.bottomHud) || !fitsBottom(state.controls)) {
    throw new Error(`Bottom game UI is clipped in landscape: ${JSON.stringify(state)}`);
  }
  if ((state.huntHud?.width ?? Infinity) > 652 || (state.huntHud?.width ?? Infinity) > state.innerWidth - 46) {
    throw new Error(`Turbo Hunt HUD is too wide for landscape scenery: ${JSON.stringify(state)}`);
  }
  if ((state.huntHud?.height ?? Infinity) > Math.max(54, state.innerHeight * 0.22)) {
    throw new Error(`Turbo Hunt HUD is too tall for landscape scenery: ${JSON.stringify(state)}`);
  }

  const screenshot = await request(`/session/${sessionId}/screenshot`, { method: "GET" });
  const pngBase64 = screenshot?.value;
  if (typeof pngBase64 !== "string" || pngBase64.length < 100) throw new Error("iPhone landscape screenshot payload is missing");

  await mkdir(new URL("../artifacts/webgl-audit/", import.meta.url), { recursive: true });
  await writeFile(new URL(`../${output}`, import.meta.url), Buffer.from(pngBase64, "base64"));
  await writeFile(new URL(`../${stateOutput}`, import.meta.url), `${JSON.stringify(state, null, 2)}\n`);
  console.log(`iPhone landscape layout audit passed: ${JSON.stringify(state)}`);
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
