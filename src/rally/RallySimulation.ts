export const RALLY_SIMULATION_STEP = 1 / 60;
export const RALLY_SIMULATION_MAX_STEPS = 5;

/**
 * Keeps gameplay simulation time independent from render cadence.
 * The callback always receives the same fixed delta, which makes a recorded
 * input sequence replayable at 30, 60, or 120 render frames per second.
 */
export class RallyFixedStepClock {
  private accumulator = 0;

  constructor(
    readonly step = RALLY_SIMULATION_STEP,
    readonly maxSteps = RALLY_SIMULATION_MAX_STEPS,
  ) {}

  reset(): void {
    this.accumulator = 0;
  }

  advance(deltaSeconds: number, simulate: (fixedDelta: number) => void): number {
    const delta = Math.min(0.25, Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
    this.accumulator += delta;
    let steps = 0;
    // Render deltas such as 1/30 are not exactly representable in binary.
    // A tiny epsilon prevents a cadence from losing an occasional fixed step
    // when the accumulator lands one ulp below the step threshold.
    while (this.accumulator + 1e-9 >= this.step && steps < this.maxSteps) {
      simulate(this.step);
      this.accumulator -= this.step;
      if (this.accumulator < 0 && this.accumulator > -1e-9) this.accumulator = 0;
      steps += 1;
    }
    // Drop excess catch-up time after a stalled tab/frame. This avoids a
    // long simulation spiral on iPhone Safari after the page resumes.
    if (steps === this.maxSteps && this.accumulator >= this.step) this.accumulator = 0;
    return steps;
  }

  get interpolation(): number {
    return this.accumulator / this.step;
  }
}
