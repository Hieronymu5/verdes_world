import { Injectable } from '@angular/core';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';

export interface SvgGifFrame {
  /** A complete, standalone `<svg>...</svg>` document string for this frame. */
  svg: string;
  /** How long this frame is shown for, in milliseconds. */
  delayMs: number;
}

export interface SvgGifExportOptions {
  width: number;
  height: number;
  filename: string;
}

/** Encodes a sequence of standalone SVG frames into a downloadable animated GIF. */
@Injectable({ providedIn: 'root' })
export class SvgGifExportService {
  async exportFrames(frames: SvgGifFrame[], options: SvgGifExportOptions): Promise<void> {
    const gif = GIFEncoder();

    for (const frame of frames) {
      const imageData = await this.rasterize(frame.svg, options.width, options.height);
      const palette = quantize(imageData.data, 256);
      const index = applyPalette(imageData.data, palette);
      gif.writeFrame(index, options.width, options.height, {
        palette,
        delay: frame.delayMs,
        repeat: 0,
      });
    }

    gif.finish();
    this.download(gif.bytes(), options.filename);
  }

  private rasterize(svg: string, width: number, height: number): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(url);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context is unavailable'));
          return;
        }

        ctx.drawImage(image, 0, 0, width, height);
        resolve(ctx.getImageData(0, 0, width, height));
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to rasterize map frame'));
      };
      image.src = url;
    });
  }

  private download(bytes: Uint8Array, filename: string): void {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/gif' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
