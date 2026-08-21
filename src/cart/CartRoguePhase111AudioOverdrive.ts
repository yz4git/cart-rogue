import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueCanvasPreview } from "./CartRogueCanvasPreview";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { getCartPlayerDamageFeedbackState } from "./CartRoguePhase91DamageFeedback2";
import {
  getCartTurboDominoState,
  type CartTurboDominoSnapshot,
  type CartTurboDominoStage,
} from "./CartRoguePhase110TurboDominoCoreLoop";

type AudioContextConstructor = new () => AudioContext;

export const CART_PHASE111_AUDIO_OVERDRIVE_ID = "phase111-cart-rogue-audio-overdrive-v1";
export const CART_PHASE111_MAX_TRANSIENT_VOICES = 14;

export interface CartPhase111AudioMix {
  engineFrequency: number;
  engineGain: number;
  turboFrequency: number;
  turboGain: number;
  musicFrequency: number;
  musicGain: number;
  pulseSeconds: number;
}

export function cartPhase111AudioMix(
  speed: number,
  boostActive: boolean,
  heatLevel: number,
  paused = false,
): CartPhase111AudioMix {
  const absoluteSpeed = Math.max(0, Math.abs(speed));
  const heat = Math.max(1, Math.min(5, Math.floor(heatLevel)));
  if (paused) {
    return {
      engineFrequency: 72,
      engineGain: 0,
      turboFrequency: 180,
      turboGain: 0,
      musicFrequency: 92,
      musicGain: 0,
      pulseSeconds: 0.55,
    };
  }

  const speedRatio = Math.min(1, absoluteSpeed / 26);
  return {
    engineFrequency: 72 + absoluteSpeed * 6.8 + (boostActive ? 72 : 0) + (heat - 1) * 3.5,
    engineGain: 0.018 + speedRatio * 0.032 + (boostActive ? 0.012 : 0),
    turboFrequency: 185 + absoluteSpeed * 11 + heat * 16,
    turboGain: boostActive ? 0.027 + heat * 0.0025 : 0.0001,
    musicFrequency: 92 + (heat - 1) * 9.5,
    musicGain: 0.006 + (heat - 1) * 0.0016,
    pulseSeconds: Math.max(0.2, 0.58 - (heat - 1) * 0.075),
  };
}

export function cartPhase111ChainPitch(chain: number): number {
  const normalized = Math.max(1, Math.min(10, Math.floor(chain)));
  return 330 + normalized * 42;
}

interface Phase111Demo {
  session: CartArenaSession;
  setSteering(value: number): void;
  setBoost(active: boolean): void;
  setBrake(active: boolean): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

interface Phase111WebGLDemo extends Phase111Demo {
  updateVisuals(delta: number): void;
}

interface Phase111CanvasDemo extends Phase111Demo {
  draw(): void;
}

interface ToneOptions {
  frequency: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  sweepTo?: number;
  delay?: number;
}

class CartRogueAudioOverdrive {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private turbo: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private music: OscillatorNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private paused = false;
  private disposed = false;
  private activatedCuePlayed = false;
  private activeTransientVoices = 0;
  private initialized = false;
  private previousBoost = false;
  private previousRamSignature = "";
  private previousHeatLevel = 1;
  private previousDominoCount = 0;
  private previousChain = 0;
  private previousStage: CartTurboDominoStage = "DROP_IN";
  private previousDamageSerial = 0;
  private readonly enemyAlive = new Map<string, boolean>();
  private readonly obstacleDestroyed = new Map<string, boolean>();
  private readonly resourceCollected = new Map<string, boolean>();

  constructor(private readonly session: CartArenaSession) {}

  activate(): void {
    if (this.disposed || typeof window === "undefined") return;
    this.captureBaseline();

    const AudioContextClass = (window.AudioContext
      || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext) as AudioContextConstructor | undefined;
    if (!AudioContextClass) return;

    if (!this.context) this.createGraph(AudioContextClass);
    if (!this.context || !this.master) return;

    if (this.context.state !== "running") void this.context.resume();
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.paused ? 0.0001 : 0.7, now, 0.025);

    if (!this.activatedCuePlayed) {
      this.activatedCuePlayed = true;
      this.tone({ frequency: 330, duration: 0.07, gain: 0.035, type: "triangle" });
      this.tone({ frequency: 495, duration: 0.08, gain: 0.032, type: "triangle", delay: 0.055 });
      this.tone({ frequency: 660, duration: 0.1, gain: 0.03, type: "triangle", delay: 0.11 });
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(paused ? 0.0001 : 0.7, now, paused ? 0.035 : 0.06);
  }

  update(snapshot: CartArenaSessionSnapshot): void {
    if (this.disposed || !this.context || !this.engine || !this.engineGain || !this.turbo || !this.turboGain || !this.music || !this.musicGain) return;
    this.captureBaseline();

    const domino = getCartTurboDominoState(this.session);
    const damage = getCartPlayerDamageFeedbackState(this.session);
    const mix = cartPhase111AudioMix(snapshot.speed, snapshot.boostActive, domino.heatLevel, this.paused);
    this.updateContinuousMix(mix, domino);

    if (snapshot.boostActive !== this.previousBoost) {
      if (snapshot.boostActive) this.cueTurboStart(domino.heatLevel);
      else this.cueTurboEnd();
      this.previousBoost = snapshot.boostActive;
    }

    const ramSignature = `${snapshot.lastRamEnemyId ?? ""}:${snapshot.ramCombo}:${Math.round(snapshot.lastRamDamage * 10)}`;
    if (snapshot.lastRamEnemyId && ramSignature !== this.previousRamSignature) {
      this.cueRam(snapshot.lastRamDamage, snapshot.ramCombo);
      this.previousRamSignature = ramSignature;
    }

    for (const enemy of snapshot.enemies) {
      const wasAlive = this.enemyAlive.get(enemy.id);
      if (wasAlive === true && !enemy.alive) this.cueEnemyDestroyed(enemy.kind);
      this.enemyAlive.set(enemy.id, enemy.alive);
    }

    for (const obstacle of snapshot.obstacles) {
      const wasDestroyed = this.obstacleDestroyed.get(obstacle.id);
      if (wasDestroyed === false && obstacle.destroyed) this.cueSmash();
      this.obstacleDestroyed.set(obstacle.id, obstacle.destroyed);
    }

    for (const resource of snapshot.resources) {
      const wasCollected = this.resourceCollected.get(resource.id);
      if (wasCollected === false && resource.collected) this.cuePickup(resource.kind);
      this.resourceCollected.set(resource.id, resource.collected);
    }

    if (domino.dominoCount > this.previousDominoCount) {
      this.cueDomino(domino.dominoCount, domino.chain);
      this.previousDominoCount = domino.dominoCount;
    }

    if (domino.chain > this.previousChain && domino.chain >= 2) {
      this.tone({
        frequency: cartPhase111ChainPitch(domino.chain),
        duration: 0.085,
        gain: 0.036,
        type: "triangle",
        sweepTo: cartPhase111ChainPitch(domino.chain) * 1.16,
      });
    }
    this.previousChain = domino.chain;

    if (domino.heatLevel > this.previousHeatLevel) this.cueHeatLevel(domino.heatLevel);
    this.previousHeatLevel = domino.heatLevel;

    if (domino.stage !== this.previousStage) {
      this.cueStage(domino.stage);
      this.previousStage = domino.stage;
    }

    if (damage.hitSerial > this.previousDamageSerial) {
      this.cueDamage();
      this.previousDamageSerial = damage.hitSerial;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try { this.engine?.stop(); } catch {}
    try { this.turbo?.stop(); } catch {}
    try { this.music?.stop(); } catch {}
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.engine = null;
    this.engineGain = null;
    this.turbo = null;
    this.turboGain = null;
    this.music = null;
    this.musicGain = null;
    this.noiseBuffer = null;
  }

  private captureBaseline(): void {
    if (this.initialized) return;
    const snapshot = this.session.snapshot();
    const domino = getCartTurboDominoState(this.session);
    const damage = getCartPlayerDamageFeedbackState(this.session);
    this.previousBoost = snapshot.boostActive;
    this.previousRamSignature = `${snapshot.lastRamEnemyId ?? ""}:${snapshot.ramCombo}:${Math.round(snapshot.lastRamDamage * 10)}`;
    this.previousHeatLevel = domino.heatLevel;
    this.previousDominoCount = domino.dominoCount;
    this.previousChain = domino.chain;
    this.previousStage = domino.stage;
    this.previousDamageSerial = damage.hitSerial;
    snapshot.enemies.forEach((enemy) => this.enemyAlive.set(enemy.id, enemy.alive));
    snapshot.obstacles.forEach((obstacle) => this.obstacleDestroyed.set(obstacle.id, obstacle.destroyed));
    snapshot.resources.forEach((resource) => this.resourceCollected.set(resource.id, resource.collected));
    this.initialized = true;
  }

  private createGraph(AudioContextClass: AudioContextConstructor): void {
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);

    const engineGain = context.createGain();
    engineGain.gain.value = 0.0001;
    engineGain.connect(master);
    const engine = context.createOscillator();
    engine.type = "sawtooth";
    engine.frequency.value = 72;
    engine.connect(engineGain);
    engine.start();

    const turboGain = context.createGain();
    turboGain.gain.value = 0.0001;
    turboGain.connect(master);
    const turbo = context.createOscillator();
    turbo.type = "triangle";
    turbo.frequency.value = 185;
    turbo.connect(turboGain);
    turbo.start();

    const musicGain = context.createGain();
    musicGain.gain.value = 0.0001;
    musicGain.connect(master);
    const music = context.createOscillator();
    music.type = "triangle";
    music.frequency.value = 92;
    music.connect(musicGain);
    music.start();

    this.context = context;
    this.master = master;
    this.engine = engine;
    this.engineGain = engineGain;
    this.turbo = turbo;
    this.turboGain = turboGain;
    this.music = music;
    this.musicGain = musicGain;
    this.noiseBuffer = this.createNoiseBuffer(context);
  }

  private updateContinuousMix(mix: CartPhase111AudioMix, domino: CartTurboDominoSnapshot): void {
    if (!this.context || !this.engine || !this.engineGain || !this.turbo || !this.turboGain || !this.music || !this.musicGain) return;
    const now = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(mix.engineFrequency, now, 0.035);
    this.engineGain.gain.setTargetAtTime(mix.engineGain, now, 0.055);
    this.turbo.frequency.setTargetAtTime(mix.turboFrequency, now, 0.025);
    this.turboGain.gain.setTargetAtTime(mix.turboGain, now, 0.035);

    const urgent = domino.stage === "HUNTED" || domino.stage === "COUNTERATTACK" || domino.stage === "TITAN";
    const pulsePhase = (now % mix.pulseSeconds) / mix.pulseSeconds;
    const pulse = urgent ? (pulsePhase < 0.22 ? 1.6 : 0.72) : 0.82 + Math.sin(now * 4.2) * 0.12;
    const stageFrequency = domino.stage === "TITAN" ? mix.musicFrequency * 0.72 : domino.stage === "COUNTERATTACK" ? mix.musicFrequency * 1.45 : mix.musicFrequency;
    this.music.frequency.setTargetAtTime(stageFrequency, now, 0.055);
    this.musicGain.gain.setTargetAtTime(Math.max(0.0001, mix.musicGain * pulse), now, 0.045);
  }

  private cueTurboStart(heatLevel: number): void {
    const heat = Math.max(1, Math.min(5, heatLevel));
    this.tone({ frequency: 165 + heat * 12, duration: 0.16, gain: 0.062, type: "sawtooth", sweepTo: 640 + heat * 38 });
    this.noiseBurst(0.12, 0.03, 1500 + heat * 180);
  }

  private cueTurboEnd(): void {
    this.tone({ frequency: 260, duration: 0.11, gain: 0.032, type: "triangle", sweepTo: 120 });
  }

  private cueRam(damage: number, combo: number): void {
    const strength = Math.max(0, Math.min(1, damage / 160));
    const base = 92 + strength * 34;
    this.tone({ frequency: base, duration: 0.105, gain: 0.075, type: "square", sweepTo: base * 0.58 });
    this.noiseBurst(0.085, 0.052, 780 + strength * 720);
    if (combo >= 2) {
      this.tone({ frequency: cartPhase111ChainPitch(combo), duration: 0.075, gain: 0.035, type: "triangle", delay: 0.035 });
    }
  }

  private cueEnemyDestroyed(kind: CartArenaSessionSnapshot["enemies"][number]["kind"]): void {
    if (kind === "boss") {
      this.tone({ frequency: 86, duration: 0.32, gain: 0.082, type: "sawtooth", sweepTo: 44 });
      this.noiseBurst(0.2, 0.065, 620);
      return;
    }
    const frequency = kind === "heavy" ? 116 : kind === "chaser" ? 148 : 132;
    this.tone({ frequency, duration: 0.13, gain: 0.052, type: "square", sweepTo: frequency * 0.72 });
  }

  private cueSmash(): void {
    this.tone({ frequency: 188, duration: 0.1, gain: 0.05, type: "square", sweepTo: 92 });
    this.noiseBurst(0.11, 0.05, 1050);
  }

  private cuePickup(kind: CartArenaSessionSnapshot["resources"][number]["kind"]): void {
    if (kind === "turbo") {
      this.tone({ frequency: 520, duration: 0.07, gain: 0.035, type: "triangle" });
      this.tone({ frequency: 780, duration: 0.09, gain: 0.032, type: "triangle", delay: 0.05 });
      return;
    }
    this.tone({ frequency: 390, duration: 0.09, gain: 0.028, type: "sine" });
    this.tone({ frequency: 520, duration: 0.1, gain: 0.026, type: "sine", delay: 0.055 });
  }

  private cueDomino(dominoCount: number, chain: number): void {
    const pitch = 360 + (dominoCount % 8) * 34 + Math.min(120, chain * 10);
    this.tone({ frequency: pitch, duration: 0.07, gain: 0.03, type: "triangle", sweepTo: pitch * 1.12 });
  }

  private cueHeatLevel(level: number): void {
    const base = 260 + Math.max(1, Math.min(5, level)) * 55;
    this.tone({ frequency: base, duration: 0.08, gain: 0.034, type: "triangle" });
    this.tone({ frequency: base * 1.25, duration: 0.09, gain: 0.032, type: "triangle", delay: 0.06 });
    this.tone({ frequency: base * 1.5, duration: 0.12, gain: 0.03, type: "triangle", delay: 0.12 });
  }

  private cueStage(stage: CartTurboDominoStage): void {
    if (stage === "HUNTED") {
      this.tone({ frequency: 220, duration: 0.22, gain: 0.045, type: "square", sweepTo: 330 });
      this.tone({ frequency: 165, duration: 0.22, gain: 0.045, type: "square", sweepTo: 260, delay: 0.19 });
      return;
    }
    if (stage === "COUNTERATTACK") {
      this.tone({ frequency: 330, duration: 0.08, gain: 0.042, type: "triangle" });
      this.tone({ frequency: 495, duration: 0.09, gain: 0.042, type: "triangle", delay: 0.065 });
      this.tone({ frequency: 742, duration: 0.14, gain: 0.048, type: "triangle", delay: 0.13 });
      return;
    }
    if (stage === "TITAN") {
      this.tone({ frequency: 74, duration: 0.36, gain: 0.085, type: "sawtooth", sweepTo: 52 });
      this.tone({ frequency: 111, duration: 0.28, gain: 0.055, type: "square", delay: 0.22 });
      this.noiseBurst(0.24, 0.055, 520, 0.12);
      return;
    }
    if (stage === "CLEAR") {
      [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
        this.tone({ frequency, duration: 0.18, gain: 0.035, type: "triangle", delay: index * 0.085 });
      });
    }
  }

  private cueDamage(): void {
    this.tone({ frequency: 88, duration: 0.16, gain: 0.078, type: "square", sweepTo: 56 });
    this.tone({ frequency: 176, duration: 0.12, gain: 0.036, type: "sawtooth", delay: 0.025 });
    this.noiseBurst(0.13, 0.06, 480);
  }

  private tone(options: ToneOptions): void {
    if (!this.context || !this.master || this.activeTransientVoices >= CART_PHASE111_MAX_TRANSIENT_VOICES) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + Math.max(0, options.delay ?? 0);
    const end = start + Math.max(0.025, options.duration);
    oscillator.type = options.type ?? "triangle";
    oscillator.frequency.setValueAtTime(Math.max(30, options.frequency), start);
    if (options.sweepTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, options.sweepTo), end);
    }
    gain.gain.setValueAtTime(Math.max(0.0001, options.gain), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(this.master);
    this.activeTransientVoices += 1;
    oscillator.onended = () => { this.activeTransientVoices = Math.max(0, this.activeTransientVoices - 1); };
    oscillator.start(start);
    oscillator.stop(end + 0.015);
  }

  private noiseBurst(duration: number, gainValue: number, filterFrequency: number, delay = 0): void {
    if (!this.context || !this.master || !this.noiseBuffer || this.activeTransientVoices >= CART_PHASE111_MAX_TRANSIENT_VOICES) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const start = this.context.currentTime + Math.max(0, delay);
    const end = start + Math.max(0.03, duration);
    source.buffer = this.noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.max(120, filterFrequency), start);
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(filter).connect(gain).connect(this.master);
    this.activeTransientVoices += 1;
    source.onended = () => { this.activeTransientVoices = Math.max(0, this.activeTransientVoices - 1); };
    source.start(start);
    source.stop(end + 0.01);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.max(1, Math.floor(context.sampleRate * 0.28));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x4f1bbcdc;
    for (let index = 0; index < data.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[index] = ((seed / 0xffffffff) * 2 - 1) * (1 - index / data.length);
    }
    return buffer;
  }
}

const audioByDemo = new WeakMap<object, CartRogueAudioOverdrive>();
const INTERACTION_PATCH_KEY = "__cartRoguePhase111AudioInteractionPatched__";
const WEBGL_PATCH_KEY = "__cartRoguePhase111AudioWebGLPatched__";
const CANVAS_PATCH_KEY = "__cartRoguePhase111AudioCanvasPatched__";

function audioFor(demo: Phase111Demo): CartRogueAudioOverdrive {
  const key = demo as unknown as object;
  const existing = audioByDemo.get(key);
  if (existing) return existing;
  const created = new CartRogueAudioOverdrive(demo.session);
  audioByDemo.set(key, created);
  return created;
}

function patchInteraction(prototype: Phase111Demo & Record<string, unknown>): void {
  if (prototype[INTERACTION_PATCH_KEY]) return;
  prototype[INTERACTION_PATCH_KEY] = true;

  const previousSetSteering = prototype.setSteering;
  prototype.setSteering = function phase111AudioSetSteering(this: Phase111Demo, value: number): void {
    audioFor(this).activate();
    previousSetSteering.call(this, value);
  };

  const previousSetBoost = prototype.setBoost;
  prototype.setBoost = function phase111AudioSetBoost(this: Phase111Demo, active: boolean): void {
    audioFor(this).activate();
    previousSetBoost.call(this, active);
  };

  const previousSetBrake = prototype.setBrake;
  prototype.setBrake = function phase111AudioSetBrake(this: Phase111Demo, active: boolean): void {
    audioFor(this).activate();
    previousSetBrake.call(this, active);
  };

  const previousPause = prototype.pause;
  prototype.pause = function phase111AudioPause(this: Phase111Demo): void {
    audioFor(this).setPaused(true);
    previousPause.call(this);
  };

  const previousResume = prototype.resume;
  prototype.resume = function phase111AudioResume(this: Phase111Demo): void {
    previousResume.call(this);
    const audio = audioFor(this);
    audio.activate();
    audio.setPaused(false);
  };

  const previousDispose = prototype.dispose;
  prototype.dispose = function phase111AudioDispose(this: Phase111Demo): void {
    audioFor(this).dispose();
    audioByDemo.delete(this as unknown as object);
    previousDispose.call(this);
  };
}

function patchWebGL(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase111WebGLDemo & Record<string, unknown>;
  patchInteraction(prototype);
  if (prototype[WEBGL_PATCH_KEY]) return;
  prototype[WEBGL_PATCH_KEY] = true;
  const previousUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase111AudioWebGLUpdate(this: Phase111WebGLDemo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    audioFor(this).update(this.session.snapshot());
  };
}

function patchCanvas(): void {
  const prototype = CartRogueCanvasPreview.prototype as unknown as Phase111CanvasDemo & Record<string, unknown>;
  patchInteraction(prototype);
  if (prototype[CANVAS_PATCH_KEY]) return;
  prototype[CANVAS_PATCH_KEY] = true;
  const previousDraw = prototype.draw;
  prototype.draw = function phase111AudioCanvasDraw(this: Phase111CanvasDemo): void {
    previousDraw.call(this);
    audioFor(this).update(this.session.snapshot());
  };
}

export function installCartRoguePhase111AudioOverdrive(): void {
  patchWebGL();
  patchCanvas();
}

installCartRoguePhase111AudioOverdrive();
