import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const driverBin = process.env.WEBDRIVER_BIN || "chromedriver";
const driverPort = Number(process.env.PLAYTEST_WEBDRIVER_PORT || 9521);
const driverUrl = `http://127.0.0.1:${driverPort}`;
const auditUrl = process.env.AUDIT_URL || "http://127.0.0.1:3000/";
const stateOutput = process.env.PLAYTEST_STATE_OUTPUT || "artifacts/webgl-audit/playtest-review.json";
const screenshotOutput = process.env.PLAYTEST_SCREENSHOT_OUTPUT || "artifacts/webgl-audit/cart-rogue-playtest.png";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const response = await fetch(`${driverUrl}${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`WebDriver ${path} failed: ${response.status} ${text}`);
  return body;
}
async function waitForDriver() {
  for (let i = 0; i < 60; i += 1) {
    try { const s = await request("/status", { method: "GET" }); if (s?.value?.ready !== false) return; } catch {}
    await sleep(250);
  }
  throw new Error("ChromeDriver did not become ready");
}
async function execute(sessionId, script, args = []) {
  const result = await request(`/session/${sessionId}/execute/sync`, { method: "POST", body: JSON.stringify({ script, args }) });
  return result?.value;
}
async function key(sessionId, keyName, down) {
  await execute(sessionId, `window.dispatchEvent(new KeyboardEvent('${down ? "keydown" : "keyup"}', {key:arguments[0],code:arguments[1],bubbles:true,cancelable:true})); return true;`, [keyName, keyName === " " ? "Space" : keyName]);
}
async function sample(sessionId) {
  return execute(sessionId, `
    const text=document.body.innerText||''; const canvas=document.querySelector('canvas.cart-rogue-canvas');
    const gas=text.match(/GAS\\s+(\\d+)%/); const lines=text.split('\\n').filter(Boolean);
    return {ready:Boolean(canvas), text, lines,
      hazard:/AOE (TRACKING|LOCKED|FIRING|IMPACT)/.test(text), locked:text.includes('AOE LOCKED'), firing:text.includes('AOE FIRING'),
      hit:text.includes('DIRECT HIT'), perfect:text.includes('PERFECT AOE DODGE'), counter:text.includes('COUNTER WINDOW')||text.includes('COUNTER NOW'),
      threat:text.includes('DANGER ·')||text.includes('DODGE WAVE')||text.includes('CHASE PRESSURE'),
      pursuit:text.includes('PURSUIT')||text.includes('BREAKOUT')||text.includes('DANGER ZONE'), fieldEvent:text.includes('FIELD EVENT'),
      gas:gas?Number(gas[1]):null, width:canvas?.clientWidth||0, height:canvas?.clientHeight||0};
  `);
}
function metrics(label){return{label,durationSeconds:0,samples:0,hazardEpisodes:0,hazardActiveMs:0,hits:0,perfectDodges:0,counterWindows:0,threatSamples:0,pursuitSamples:0,fieldEventSamples:0,turboUses:0,steerActions:0,gasSamples:[]};}
async function runScenario(sessionId, mode, seconds) {
  const m=metrics(mode); const started=Date.now(); let ph=false,pi=false,pp=false,pc=false; let steering=0,releaseAt=0,nextTurbo=Date.now()+4200,direction=1;
  while(Date.now()-started<seconds*1000){
    const now=Date.now(); const s=await sample(sessionId); m.samples++; m.durationSeconds=(now-started)/1000;
    if(s.hazard)m.hazardActiveMs+=80; if(s.hazard&&!ph)m.hazardEpisodes++; if(s.hit&&!pi)m.hits++; if(s.perfect&&!pp)m.perfectDodges++; if(s.counter&&!pc)m.counterWindows++;
    if(s.threat)m.threatSamples++; if(s.pursuit)m.pursuitSamples++; if(s.fieldEvent)m.fieldEventSamples++; if(s.gas!==null)m.gasSamples.push(s.gas);
    if(mode==='evasive'){
      if((s.locked||s.firing)&&steering===0){direction*=-1;steering=direction;await key(sessionId,direction<0?'ArrowLeft':'ArrowRight',true);releaseAt=now+850;m.steerActions++;}
      if(steering!==0&&now>=releaseAt){await key(sessionId,steering<0?'ArrowLeft':'ArrowRight',false);steering=0;}
      if(now>=nextTurbo){await key(sessionId,' ',true);await sleep(520);await key(sessionId,' ',false);m.turboUses++;nextTurbo=Date.now()+5200;}
    }
    ph=s.hazard;pi=s.hit;pp=s.perfect;pc=s.counter; await sleep(80);
  }
  if(steering!==0)await key(sessionId,steering<0?'ArrowLeft':'ArrowRight',false);
  m.hazardActiveRatio=m.durationSeconds?m.hazardActiveMs/(m.durationSeconds*1000):0; m.hitRatePerHazard=m.hazardEpisodes?m.hits/m.hazardEpisodes:0; m.perfectRatePerHazard=m.hazardEpisodes?m.perfectDodges/m.hazardEpisodes:0;
  m.startGas=m.gasSamples[0]??null;m.endGas=m.gasSamples.at(-1)??null;m.minGas=m.gasSamples.length?Math.min(...m.gasSamples):null;delete m.gasSamples;return m;
}

const driver=spawn(driverBin,[`--port=${driverPort}`,"--allowed-origins=*"],{stdio:["ignore","pipe","pipe"]}); let driverLog="";driver.stdout.on("data",c=>driverLog+=c.toString());driver.stderr.on("data",c=>driverLog+=c.toString());let sessionId=null;
try{
  await waitForDriver(); const session=await request("/session",{method:"POST",body:JSON.stringify({capabilities:{alwaysMatch:{browserName:"chrome","goog:chromeOptions":{args:["--headless=new","--no-sandbox","--disable-dev-shm-usage","--ignore-gpu-blocklist","--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--window-size=844,390"]}}}})}); sessionId=session?.value?.sessionId||session?.sessionId;if(!sessionId)throw new Error("session id missing");
  async function fresh(){await request(`/session/${sessionId}/url`,{method:"POST",body:JSON.stringify({url:`${auditUrl}?playtest=${Date.now()}`})});for(let i=0;i<120;i+=1){const s=await sample(sessionId);if(s.ready&&s.text.includes('TURBO HUNT'))return;await sleep(100);}throw new Error('runtime not ready');}
  await fresh(); const passive=await runScenario(sessionId,'passive-straight',22);
  await fresh(); const evasive=await runScenario(sessionId,'evasive',34);
  const finalState=await sample(sessionId); const shot=await request(`/session/${sessionId}/screenshot`,{method:"GET"}); if(typeof shot?.value!=="string")throw new Error('screenshot missing');
  const summary={viewport:{width:finalState.width,height:finalState.height},passive,evasive,delta:{hitRateChange:evasive.hitRatePerHazard-passive.hitRatePerHazard,perfectRateChange:evasive.perfectRatePerHazard-passive.perfectRatePerHazard,hazardRatioChange:evasive.hazardActiveRatio-passive.hazardActiveRatio,gasChangePassive:passive.startGas!==null&&passive.endGas!==null?passive.endGas-passive.startGas:null,gasChangeEvasive:evasive.startGas!==null&&evasive.endGas!==null?evasive.endGas-evasive.startGas:null},finalTextSample:finalState.lines.slice(0,35)};
  await mkdir(new URL('../artifacts/webgl-audit/',import.meta.url),{recursive:true});await writeFile(new URL(`../${stateOutput}`,import.meta.url),`${JSON.stringify(summary,null,2)}\n`);await writeFile(new URL(`../${screenshotOutput}`,import.meta.url),Buffer.from(shot.value,'base64'));console.log(JSON.stringify(summary));
}catch(error){console.error(error);if(driverLog)console.error(driverLog);process.exitCode=1;}finally{if(sessionId){try{await request(`/session/${sessionId}`,{method:'DELETE'});}catch{}}driver.kill('SIGTERM');}
