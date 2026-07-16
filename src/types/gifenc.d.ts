declare module 'gifenc' {
  export type RGB = [number, number, number];
  export type RGBA = [number, number, number, number];
  export type PaletteColor = RGB | RGBA;
  export type PixelFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export interface QuantizeOptions {
    format?: PixelFormat;
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): PaletteColor[];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: PaletteColor[],
    format?: PixelFormat,
  ): Uint8Array;

  export interface WriteFrameOptions {
    palette?: PaletteColor[];
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
  }

  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeHeader(): void;
    reset(): void;
    readonly buffer: ArrayBuffer;
  }

  export interface GIFEncoderOptions {
    auto?: boolean;
    initialCapacity?: number;
  }

  export function GIFEncoder(opts?: GIFEncoderOptions): GIFEncoderInstance;
}
