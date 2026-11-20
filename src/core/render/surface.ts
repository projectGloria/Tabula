/** A canvas sized to CSS pixels × devicePixelRatio. */
export class CanvasSurface {
  readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  get pixelRatio(): number {
    return this.dpr;
  }

  /** Returns true when the backing store actually changed. */
  resize(cssWidth: number, cssHeight: number, dpr: number): boolean {
    if (cssWidth === this.cssWidth && cssHeight === this.cssHeight && dpr === this.dpr)
      return false;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    return true;
  }

  /** Resets the transform to CSS-pixel space and clears the canvas. */
  clear(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}
