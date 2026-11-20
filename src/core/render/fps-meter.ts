/** Rolling frames-per-second over the last second of recorded frames. */
export class FpsMeter {
  private readonly stamps: number[] = [];

  tick(now: number): void {
    this.stamps.push(now);
    while (this.stamps.length > 0 && (this.stamps[0] ?? now) < now - 1000) this.stamps.shift();
  }

  get fps(): number {
    return this.stamps.length;
  }

  reset(): void {
    this.stamps.length = 0;
  }
}
