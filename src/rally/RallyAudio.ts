import { RallyCar } from "./RallyCar";
import type { RallyPhase } from "./RallyTypes";

type AudioContextConstructor = new () => AudioContext;

export interface RallyAudioChannelVolumes {
  effects: number;
  music: number;
}

export function rallyAudioChannelVolumes(soundEnabled: boolean, musicEnabled: boolean): RallyAudioChannelVolumes {
  return {
    effects: soundEnabled ? 1 : 0,
    music: musicEnabled ? 1 : 0,
  };
}

export class RallyAudio {
  private context: AudioContext | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: AudioParam | null = null;
  private skid: OscillatorNode | null = null;
  private skidGain: AudioParam | null = null;
  private surface: OscillatorNode | null = null;
  private surfaceGain: AudioParam | null = null;
  private music: OscillatorNode | null = null;
  private musicGain: AudioParam | null = null;
  private previousPhase: RallyPhase = "ready";
  private previousCheckpoint = 0;
  private musicStep = 0;
  private musicTimer = 0;
  private collisionCooldown = 0;
  private landingCooldown = 0;
  private shortcutCooldown = 0;
  private previousBoost = false;
  private previousBoostChain = 0;
  private soundEnabled = true;
  private musicEnabled = true;

  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    const volumes = rallyAudioChannelVolumes(enabled, this.musicEnabled);
    if (!enabled) {
      if (this.engineGain) this.engineGain.value = 0;
      if (this.skidGain) this.skidGain.value = 0;
      if (this.surfaceGain) this.surfaceGain.value = 0;
    } else if (this.engineGain) {
      this.engineGain.value = volumes.effects * 0.0001;
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (this.musicGain) this.musicGain.value = enabled ? 0.008 : 0;
  }

  activate(): void {
    if (typeof window === "undefined") return;
    const AudioContextClass = (window.AudioContext
      || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext) as AudioContextConstructor | undefined;
    if (!AudioContextClass) return;
    if (!this.context) {
      this.context = new AudioContextClass();
      const engine = this.createLoop(78, "sawtooth", 0.0001);
      this.engine = engine.oscillator;
      this.engineGain = engine.gain;
      this.engineGain.value = 0.0001;
      const skid = this.createLoop(150, "square", 0.0001);
      this.skid = skid.oscillator;
      this.skidGain = skid.gain;
      this.skidGain.value = 0.0001;
      const surface = this.createLoop(90, "triangle", 0.0001);
      this.surface = surface.oscillator;
      this.surfaceGain = surface.gain;
      this.surfaceGain.value = 0.0001;
      const music = this.createLoop(110, "triangle", 0.008);
      this.music = music.oscillator;
      this.musicGain = music.gain;
      this.musicGain.value = this.musicEnabled ? 0.008 : 0;
    }
    void this.context.resume();
    this.beep(440, 0.06, 0.04);
  }

  update(car: RallyCar, phase: RallyPhase, deltaSeconds: number, checkpoint = 0): void {
    this.collisionCooldown = Math.max(0, this.collisionCooldown - deltaSeconds);
    this.landingCooldown = Math.max(0, this.landingCooldown - deltaSeconds);
    this.shortcutCooldown = Math.max(0, this.shortcutCooldown - deltaSeconds);
    this.musicTimer -= deltaSeconds;
    if (!this.context || !this.engine || !this.engineGain || !this.skid || !this.skidGain || !this.surfaceGain || !this.musicGain) return;
    const volumes = rallyAudioChannelVolumes(this.soundEnabled, this.musicEnabled);
    const speed = Math.abs(car.speed);
    const telemetry = car.telemetry();
    this.engine.frequency.value = 70 + speed * 7 + telemetry.throttle * 16 + (car.drifting ? 8 : 0)
      + (car.boostActive ? 78 + Math.min(28, car.boostChainCount * 4) : 0);
    this.engineGain.value = volumes.effects * (phase === "racing"
      ? (0.012 + Math.min(0.045, speed / 700)) * (car.boostActive ? 1.35 : 1)
      : 0.0001);
    this.skid.frequency.value = 120 + Math.abs(car.slipAngle) * 500;
    this.skidGain.value = volumes.effects * (car.drifting ? Math.min(0.05, 0.012 + Math.abs(car.slipAngle) * 0.08) : 0.0001);
    if (this.surface) this.surface.frequency.value = car.surface === "gravel" || car.surface === "rock" ? 70 : 105;
    const roughSurface = car.surface === "dirt" || car.surface === "gravel" || car.surface === "grass" || car.surface === "mud" || car.surface === "rock";
    this.surfaceGain.value = volumes.effects * (roughSurface && speed > 3 ? 0.008 + Math.min(0.02, speed / 900) : 0.0001);
    this.musicGain.value = volumes.music * (phase === "racing" || phase === "countdown" ? 0.008 : 0);
    if (this.music && this.musicTimer <= 0) {
      const notes = [110, 138.59, 164.81, 196, 164.81, 138.59];
      this.music.frequency.value = notes[this.musicStep % notes.length];
      this.musicStep += 1;
      this.musicTimer = 0.28;
    }
    if (phase !== this.previousPhase) {
      if (phase === "countdown") this.beep(330, 0.08, 0.035);
      if (phase === "racing") this.beep(660, 0.14, 0.05);
      if (phase === "finished") this.beep(880, 0.22, 0.06);
      this.previousPhase = phase;
    }
    if (checkpoint > this.previousCheckpoint) this.beep(760, 0.09, 0.045);
    this.previousCheckpoint = checkpoint;
    if (car.collisionImpact > 0.45 && this.collisionCooldown === 0) {
      this.beep(95, 0.11, 0.07);
      this.collisionCooldown = 0.25;
    }
    if (car.shortcutBreakImpact > 0.45 && this.shortcutCooldown === 0) {
      this.beep(car.rewardMessage === "BOOST SMASH" ? 260 : car.rewardMessage === "BOOST CHAIN" ? 520 : 180, 0.08, 0.055);
      this.shortcutCooldown = 0.25;
    }
    if (car.landingImpact > 0.25 && this.landingCooldown === 0) {
      this.beep(120, 0.08, 0.045);
      this.landingCooldown = 0.25;
    }
    if (car.boostActive && !this.previousBoost) this.beep(230, 0.1, 0.05);
    if (car.boostActive && car.boostChainCount > this.previousBoostChain && car.boostChainCount > 1) {
      this.beep(360 + car.boostChainCount * 38, 0.07, 0.045);
    }
    if (!car.boostActive && this.previousBoost) this.beep(120, 0.08, 0.035);
    this.previousBoost = car.boostActive;
    this.previousBoostChain = car.boostChainCount;
  }

  dispose(): void {
    this.engine?.stop();
    this.skid?.stop();
    this.surface?.stop();
    this.music?.stop();
    void this.context?.close();
    this.engine = null;
    this.skid = null;
    this.surface = null;
    this.music = null;
    this.context = null;
  }

  private createLoop(frequency: number, type: OscillatorType, volume: number): { oscillator: OscillatorNode; gain: AudioParam } {
    const context = this.context as AudioContext;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = volume;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    return { oscillator, gain: gain.gain };
  }

  private beep(frequency: number, duration: number, volume: number): void {
    if (!this.context || !this.soundEnabled) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }
}
