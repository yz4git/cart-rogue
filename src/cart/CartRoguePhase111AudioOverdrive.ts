import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueCanvasPreview } from "./CartRogueCanvasPreview";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { getCartPlayerDamageFeedbackState } from "./CartRoguePhase91DamageFeedback2";
import { getCartTurboDominoState, type CartTurboDominoSnapshot, type CartTurboDominoStage } from "./CartRoguePhase110TurboDominoCoreLoop";

type AudioContextConstructor = new () => AudioContext;
export const CART_PHASE111_AUDIO_OVERDRIVE_ID = "phase111-cart-rogue-audio-overdrive-v1.2-quieter-beds";
export const CART_PHASE111_MAX_TRANSIENT_VOICES = 12;

export interface CartPhase111AudioMix {
  engineFrequency: number; engineGain: number; engineFilterFrequency: number;
  turboFrequency: number; turboGain: number;
  musicFrequency: number; musicGain: number; pulseSeconds: number;
}

export function cartPhase111AudioMix(speed: number, boostActive: boolean, heatLevel: number, paused = false): CartPhase111AudioMix {
  const absoluteSpeed = Math.max(0, Math.abs(speed));
  const heat = Math.max(1, Math.min(5, Math.floor(heatLevel)));
  if (paused) return { engineFrequency: 70, engineGain: 0, engineFilterFrequency: 420, turboFrequency: 150, turboGain: 0, musicFrequency: 92, musicGain: 0, pulseSeconds: 0.55 };
  const speedRatio = Math.min(1, absoluteSpeed / 26);
  return {
    engineFrequency: 70 + absoluteSpeed * 5.5 + (boostActive ? 18 : 0) + (heat - 1) * 1.6,
    engineGain: 0.0018 + speedRatio * 0.0032 + (boostActive ? 0.0007 : 0),
    engineFilterFrequency: 420 + speedRatio * 220 + (boostActive ? 60 : 0),
    turboFrequency: 150 + absoluteSpeed * 6.5 + heat * 8,
    turboGain: boostActive ? 0.0009 + heat * 0.00015 : 0.0001,
    musicFrequency: 92 + (heat - 1) * 9.5,
    musicGain: 0.0075 + (heat - 1) * 0.00125,
    pulseSeconds: Math.max(0.2, 0.58 - (heat - 1) * 0.075),
  };
}

export function cartPhase111ChainPitch(chain: number): number {
  return 340 + Math.max(1, Math.min(10, Math.floor(chain))) * 44;
}

interface DemoLike { session: CartArenaSession; setSteering(v: number): void; setBoost(v: boolean): void; setBrake(v: boolean): void; pause(): void; resume(): void; dispose(): void; }
interface WebGLLike extends DemoLike { updateVisuals(delta: number): void; }
interface CanvasLike extends DemoLike { draw(): void; }
interface Tone { frequency: number; duration: number; gain: number; type?: OscillatorType; sweepTo?: number; delay?: number; }

class CartRogueAudioOverdrive {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private turbo: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private music: OscillatorNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private paused = false;
  private disposed = false;
  private initialized = false;
  private activationCuePlayed = false;
  private transientVoices = 0;
  private duckUntil = 0;
  private previousBoost = false;
  private previousRam = "";
  private previousHeat = 1;
  private previousDomino = 0;
  private previousChain = 0;
  private previousStage: CartTurboDominoStage = "DROP_IN";
  private previousDamage = 0;
  private readonly enemyAlive = new Map<string, boolean>();
  private readonly obstacleDestroyed = new Map<string, boolean>();
  private readonly resourceCollected = new Map<string, boolean>();

  constructor(private readonly session: CartArenaSession) {}

  activate(): void {
    if (this.disposed || typeof window === "undefined") return;
    this.captureBaseline();
    const AudioContextClass = (window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext) as AudioContextConstructor | undefined;
    if (!AudioContextClass) return;
    if (!this.context) this.createGraph(AudioContextClass);
    if (!this.context || !this.master) return;
    if (this.context.state !== "running") void this.context.resume();
    this.master.gain.setTargetAtTime(this.paused ? 0.0001 : 0.72, this.context.currentTime, 0.025);
    if (!this.activationCuePlayed) {
      this.activationCuePlayed = true;
      [360, 540, 720].forEach((frequency, index) => this.tone({ frequency, duration: 0.065 + index * 0.012, gain: 0.052 - index * 0.0025, type: "triangle", delay: index * 0.05 }));
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.context && this.master) this.master.gain.setTargetAtTime(paused ? 0.0001 : 0.72, this.context.currentTime, paused ? 0.035 : 0.06);
  }

  update(snapshot: CartArenaSessionSnapshot): void {
    if (this.disposed || !this.context) return;
    this.captureBaseline();
    const domino = getCartTurboDominoState(this.session);
    const damage = getCartPlayerDamageFeedbackState(this.session);
    this.updateContinuous(cartPhase111AudioMix(snapshot.speed, snapshot.boostActive, domino.heatLevel, this.paused), domino);

    if (snapshot.boostActive !== this.previousBoost) { snapshot.boostActive ? this.cueTurboStart(domino.heatLevel) : this.cueTurboEnd(); this.previousBoost = snapshot.boostActive; }
    const ram = `${snapshot.lastRamEnemyId ?? ""}:${snapshot.ramCombo}:${Math.round(snapshot.lastRamDamage * 10)}`;
    if (snapshot.lastRamEnemyId && ram !== this.previousRam) { this.cueRam(snapshot.lastRamDamage, snapshot.ramCombo); this.previousRam = ram; }

    snapshot.enemies.forEach((enemy) => { const was = this.enemyAlive.get(enemy.id); if (was === true && !enemy.alive) this.cueEnemyDestroyed(enemy.kind); this.enemyAlive.set(enemy.id, enemy.alive); });
    snapshot.obstacles.forEach((obstacle) => { const was = this.obstacleDestroyed.get(obstacle.id); if (was === false && obstacle.destroyed) this.cueSmash(); this.obstacleDestroyed.set(obstacle.id, obstacle.destroyed); });
    snapshot.resources.forEach((resource) => { const was = this.resourceCollected.get(resource.id); if (was === false && resource.collected) this.cuePickup(resource.kind); this.resourceCollected.set(resource.id, resource.collected); });

    if (domino.dominoCount > this.previousDomino) { this.cueDomino(domino.dominoCount, domino.chain); this.previousDomino = domino.dominoCount; }
    if (domino.chain > this.previousChain && domino.chain >= 2) { const pitch = cartPhase111ChainPitch(domino.chain); this.tone({ frequency: pitch, duration: 0.09, gain: 0.064, type: "triangle", sweepTo: pitch * 1.17 }); }
    this.previousChain = domino.chain;
    if (domino.heatLevel > this.previousHeat) this.cueHeatLevel(domino.heatLevel);
    this.previousHeat = domino.heatLevel;
    if (domino.stage !== this.previousStage) { this.cueStage(domino.stage); this.previousStage = domino.stage; }
    if (damage.hitSerial > this.previousDamage) { this.cueDamage(); this.previousDamage = damage.hitSerial; }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try { this.engine?.stop(); } catch {}
    try { this.turbo?.stop(); } catch {}
    try { this.music?.stop(); } catch {}
    void this.context?.close();
    this.context = null; this.master = null; this.engine = null; this.engineFilter = null; this.engineGain = null; this.turbo = null; this.turboGain = null; this.music = null; this.musicGain = null; this.noiseBuffer = null;
  }

  private captureBaseline(): void {
    if (this.initialized) return;
    const snapshot = this.session.snapshot();
    const domino = getCartTurboDominoState(this.session);
    const damage = getCartPlayerDamageFeedbackState(this.session);
    this.previousBoost = snapshot.boostActive;
    this.previousRam = `${snapshot.lastRamEnemyId ?? ""}:${snapshot.ramCombo}:${Math.round(snapshot.lastRamDamage * 10)}`;
    this.previousHeat = domino.heatLevel; this.previousDomino = domino.dominoCount; this.previousChain = domino.chain; this.previousStage = domino.stage; this.previousDamage = damage.hitSerial;
    snapshot.enemies.forEach((enemy) => this.enemyAlive.set(enemy.id, enemy.alive));
    snapshot.obstacles.forEach((obstacle) => this.obstacleDestroyed.set(obstacle.id, obstacle.destroyed));
    snapshot.resources.forEach((resource) => this.resourceCollected.set(resource.id, resource.collected));
    this.initialized = true;
  }

  private createGraph(AudioContextClass: AudioContextConstructor): void {
    const context = new AudioContextClass();
    const master = context.createGain(); master.gain.value = 0.0001; master.connect(context.destination);
    const engineGain = context.createGain(); engineGain.gain.value = 0.0001;
    const engineFilter = context.createBiquadFilter(); engineFilter.type = "lowpass"; engineFilter.frequency.value = 420; engineFilter.Q.value = 0.5; engineFilter.connect(engineGain).connect(master);
    const engine = context.createOscillator(); engine.type = "sawtooth"; engine.frequency.value = 70; engine.connect(engineFilter); engine.start();
    const turboGain = context.createGain(); turboGain.gain.value = 0.0001; turboGain.connect(master);
    const turbo = context.createOscillator(); turbo.type = "triangle"; turbo.frequency.value = 150; turbo.connect(turboGain); turbo.start();
    const musicGain = context.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(master);
    const music = context.createOscillator(); music.type = "triangle"; music.frequency.value = 92; music.connect(musicGain); music.start();
    this.context = context; this.master = master; this.engine = engine; this.engineFilter = engineFilter; this.engineGain = engineGain; this.turbo = turbo; this.turboGain = turboGain; this.music = music; this.musicGain = musicGain; this.noiseBuffer = this.makeNoise(context);
  }

  private updateContinuous(mix: CartPhase111AudioMix, domino: CartTurboDominoSnapshot): void {
    if (!this.context || !this.engine || !this.engineFilter || !this.engineGain || !this.turbo || !this.turboGain || !this.music || !this.musicGain) return;
    const now = this.context.currentTime;
    const duck = now < this.duckUntil ? 0.22 : 1;
    this.engine.frequency.setTargetAtTime(mix.engineFrequency, now, 0.05); this.engineFilter.frequency.setTargetAtTime(mix.engineFilterFrequency, now, 0.07); this.engineGain.gain.setTargetAtTime(mix.engineGain * duck, now, duck < 1 ? 0.018 : 0.09);
    this.turbo.frequency.setTargetAtTime(mix.turboFrequency, now, 0.045); this.turboGain.gain.setTargetAtTime(mix.turboGain * duck, now, duck < 1 ? 0.018 : 0.085);
    const urgent = domino.stage === "HUNTED" || domino.stage === "COUNTERATTACK" || domino.stage === "TITAN";
    const pulse = urgent ? ((now % mix.pulseSeconds) / mix.pulseSeconds < 0.22 ? 1.48 : 0.74) : 0.86 + Math.sin(now * 4.2) * 0.1;
    const frequency = domino.stage === "TITAN" ? mix.musicFrequency * 0.72 : domino.stage === "COUNTERATTACK" ? mix.musicFrequency * 1.45 : mix.musicFrequency;
    this.music.frequency.setTargetAtTime(frequency, now, 0.055); this.musicGain.gain.setTargetAtTime(Math.max(0.0001, mix.musicGain * pulse), now, 0.05);
  }

  private cueTurboStart(heat: number): void { const h = Math.max(1, Math.min(5, heat)); this.tone({ frequency: 180 + h * 13, duration: 0.15, gain: 0.064, type: "triangle", sweepTo: 620 + h * 34 }); this.noise(0.1, 0.04, 1600 + h * 170); }
  private cueTurboEnd(): void { this.tone({ frequency: 280, duration: 0.12, gain: 0.05, type: "triangle", sweepTo: 130 }); }
  private cueRam(damage: number, combo: number): void { const s = Math.max(0, Math.min(1, damage / 160)); const base = 92 + s * 36; this.tone({ frequency: base, duration: 0.115, gain: 0.12, type: "square", sweepTo: base * 0.56 }); this.noise(0.095, 0.086, 820 + s * 760); if (combo >= 2) this.tone({ frequency: cartPhase111ChainPitch(combo), duration: 0.085, gain: 0.064, type: "triangle", delay: 0.035 }); }
  private cueEnemyDestroyed(kind: CartArenaSessionSnapshot["enemies"][number]["kind"]): void { if (kind === "boss") { this.tone({ frequency: 82, duration: 0.36, gain: 0.13, type: "sawtooth", sweepTo: 42 }); this.noise(0.22, 0.105, 650); return; } const frequency = kind === "heavy" ? 112 : kind === "chaser" ? 150 : 134; this.tone({ frequency, duration: 0.14, gain: 0.086, type: "square", sweepTo: frequency * 0.7 }); this.noise(0.07, 0.052, kind === "heavy" ? 680 : 880); }
  private cueSmash(): void { this.tone({ frequency: 190, duration: 0.11, gain: 0.088, type: "square", sweepTo: 88 }); this.noise(0.12, 0.084, 1100); }
  private cuePickup(kind: CartArenaSessionSnapshot["resources"][number]["kind"]): void { const notes = kind === "turbo" ? [540, 810] : [410, 550]; notes.forEach((frequency, i) => this.tone({ frequency, duration: 0.08 + i * 0.025, gain: kind === "turbo" ? 0.062 - i * 0.004 : 0.052 - i * 0.003, type: kind === "turbo" ? "triangle" : "sine", delay: i * 0.055 })); }
  private cueDomino(count: number, chain: number): void { const pitch = 380 + (count % 8) * 36 + Math.min(130, chain * 11); this.tone({ frequency: pitch, duration: 0.08, gain: 0.058, type: "triangle", sweepTo: pitch * 1.13 }); }
  private cueHeatLevel(level: number): void { const base = 270 + Math.max(1, Math.min(5, level)) * 58; [1, 1.25, 1.5].forEach((m, i) => this.tone({ frequency: base * m, duration: 0.085 + i * 0.02, gain: 0.06 - i * 0.0025, type: "triangle", delay: i * 0.06 })); }
  private cueStage(stage: CartTurboDominoStage): void {
    if (stage === "HUNTED") { this.tone({ frequency: 218, duration: 0.23, gain: 0.078, type: "square", sweepTo: 332 }); this.tone({ frequency: 164, duration: 0.23, gain: 0.078, type: "square", sweepTo: 262, delay: 0.19 }); }
    else if (stage === "COUNTERATTACK") [340, 510, 765].forEach((f, i) => this.tone({ frequency: f, duration: 0.085 + i * 0.03, gain: 0.07 + i * 0.006, type: "triangle", delay: i * 0.065 }));
    else if (stage === "TITAN") { this.tone({ frequency: 72, duration: 0.4, gain: 0.132, type: "sawtooth", sweepTo: 48 }); this.tone({ frequency: 108, duration: 0.3, gain: 0.092, type: "square", delay: 0.22 }); this.noise(0.26, 0.105, 540, 0.12); }
    else if (stage === "CLEAR") [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone({ frequency: f, duration: 0.19, gain: 0.066, type: "triangle", delay: i * 0.085 }));
  }
  private cueDamage(): void { this.tone({ frequency: 86, duration: 0.17, gain: 0.118, type: "square", sweepTo: 54 }); this.tone({ frequency: 174, duration: 0.13, gain: 0.064, type: "sawtooth", delay: 0.025 }); this.noise(0.14, 0.094, 500); }

  private tone(options: Tone): void {
    if (!this.context || !this.master || this.transientVoices >= CART_PHASE111_MAX_TRANSIENT_VOICES) return;
    const oscillator = this.context.createOscillator(); const gain = this.context.createGain(); const start = this.context.currentTime + Math.max(0, options.delay ?? 0); const end = start + Math.max(0.025, options.duration);
    this.duckUntil = Math.max(this.duckUntil, end + 0.06);
    oscillator.type = options.type ?? "triangle"; oscillator.frequency.setValueAtTime(Math.max(30, options.frequency), start); if (options.sweepTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, options.sweepTo), end);
    gain.gain.setValueAtTime(Math.max(0.0001, options.gain), start); gain.gain.exponentialRampToValueAtTime(0.0001, end); oscillator.connect(gain).connect(this.master); this.transientVoices += 1; oscillator.onended = () => { this.transientVoices = Math.max(0, this.transientVoices - 1); }; oscillator.start(start); oscillator.stop(end + 0.015);
  }

  private noise(duration: number, gainValue: number, filterFrequency: number, delay = 0): void {
    if (!this.context || !this.master || !this.noiseBuffer || this.transientVoices >= CART_PHASE111_MAX_TRANSIENT_VOICES) return;
    const source = this.context.createBufferSource(); const filter = this.context.createBiquadFilter(); const gain = this.context.createGain(); const start = this.context.currentTime + Math.max(0, delay); const end = start + Math.max(0.03, duration);
    this.duckUntil = Math.max(this.duckUntil, end + 0.06);
    source.buffer = this.noiseBuffer; filter.type = "lowpass"; filter.frequency.setValueAtTime(Math.max(120, filterFrequency), start); gain.gain.setValueAtTime(Math.max(0.0001, gainValue), start); gain.gain.exponentialRampToValueAtTime(0.0001, end); source.connect(filter).connect(gain).connect(this.master); this.transientVoices += 1; source.onended = () => { this.transientVoices = Math.max(0, this.transientVoices - 1); }; source.start(start); source.stop(end + 0.01);
  }

  private makeNoise(context: AudioContext): AudioBuffer {
    const length = Math.max(1, Math.floor(context.sampleRate * 0.28)); const buffer = context.createBuffer(1, length, context.sampleRate); const data = buffer.getChannelData(0); let seed = 0x4f1bbcdc;
    for (let i = 0; i < data.length; i += 1) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = ((seed / 0xffffffff) * 2 - 1) * (1 - i / data.length); }
    return buffer;
  }
}

const audioByDemo = new WeakMap<object, CartRogueAudioOverdrive>();
const INTERACTION_PATCH_KEY = "__cartRoguePhase111AudioInteractionPatched__";
const WEBGL_PATCH_KEY = "__cartRoguePhase111AudioWebGLPatched__";
const CANVAS_PATCH_KEY = "__cartRoguePhase111AudioCanvasPatched__";
function audioFor(demo: DemoLike): CartRogueAudioOverdrive { const key = demo as unknown as object; const existing = audioByDemo.get(key); if (existing) return existing; const created = new CartRogueAudioOverdrive(demo.session); audioByDemo.set(key, created); return created; }

function patchInteraction(prototype: DemoLike & Record<string, unknown>): void {
  if (prototype[INTERACTION_PATCH_KEY]) return; prototype[INTERACTION_PATCH_KEY] = true;
  const steering = prototype.setSteering; prototype.setSteering = function(this: DemoLike, v: number): void { audioFor(this).activate(); steering.call(this, v); };
  const boost = prototype.setBoost; prototype.setBoost = function(this: DemoLike, v: boolean): void { audioFor(this).activate(); boost.call(this, v); };
  const brake = prototype.setBrake; prototype.setBrake = function(this: DemoLike, v: boolean): void { audioFor(this).activate(); brake.call(this, v); };
  const pause = prototype.pause; prototype.pause = function(this: DemoLike): void { audioFor(this).setPaused(true); pause.call(this); };
  const resume = prototype.resume; prototype.resume = function(this: DemoLike): void { resume.call(this); const audio = audioFor(this); audio.activate(); audio.setPaused(false); };
  const dispose = prototype.dispose; prototype.dispose = function(this: DemoLike): void { audioFor(this).dispose(); audioByDemo.delete(this as unknown as object); dispose.call(this); };
}

function patchWebGL(): void { const prototype = CartRogueWebGLDemo.prototype as unknown as WebGLLike & Record<string, unknown>; patchInteraction(prototype); if (prototype[WEBGL_PATCH_KEY]) return; prototype[WEBGL_PATCH_KEY] = true; const previous = prototype.updateVisuals; prototype.updateVisuals = function(this: WebGLLike, delta: number): void { previous.call(this, delta); audioFor(this).update(this.session.snapshot()); }; }
function patchCanvas(): void { const prototype = CartRogueCanvasPreview.prototype as unknown as CanvasLike & Record<string, unknown>; patchInteraction(prototype); if (prototype[CANVAS_PATCH_KEY]) return; prototype[CANVAS_PATCH_KEY] = true; const previous = prototype.draw; prototype.draw = function(this: CanvasLike): void { previous.call(this); audioFor(this).update(this.session.snapshot()); }; }
export function installCartRoguePhase111AudioOverdrive(): void { patchWebGL(); patchCanvas(); }
installCartRoguePhase111AudioOverdrive();