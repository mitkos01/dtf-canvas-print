
import { PackedImage, UploadedFile, CanvasConfig } from '../types';

export interface PackResult {
  packed: PackedImage[];
  failed: { file: UploadedFile; reason: string }[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Допоміжна функція для "дихання" головного потоку
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Оптимізована обрізка прозорості.
 * Використовує Uint32Array для швидкого сканування альфа-каналу.
 */
function trimTransparent(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data32 = new Uint32Array(imageData.data.buffer);
  
  let top = canvas.height, bottom = 0, left = canvas.width, right = 0;
  let found = false;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      // 0xFF000000 - маска для альфа-каналу в Little Endian (ABGR)
      // Якщо хоча б 4 біти альфи є (поріг ~15/255)
      if ((data32[y * canvas.width + x] & 0xFF000000) !== 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        found = true;
      }
    }
  }

  if (!found) return canvas;

  const trimmedWidth = right - left + 1;
  const trimmedHeight = bottom - top + 1;
  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  
  if (trimmedCtx) {
    trimmedCtx.drawImage(img, left, top, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
  }
  return trimmedCanvas;
}

async function canvasToBlobUrl(canvas: HTMLCanvasElement | HTMLImageElement): Promise<string> {
  if (canvas instanceof HTMLImageElement) return canvas.src;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else resolve('');
    }, 'image/png');
  });
}

class MaxRectsPacker {
  private freeRects: Rect[] = [];
  constructor(private width: number, private height: number) {
    this.freeRects.push({ x: 0, y: 0, w: width, h: height });
  }

  pack(w: number, h: number, allowRotation: boolean): { x: number; y: number; rotated: boolean } | null {
    let bestShortSideFit = Number.MAX_VALUE;
    let bestIndex = -1;
    let bestRotated = false;

    for (let i = 0; i < this.freeRects.length; i++) {
      const rect = this.freeRects[i];

      if (rect.w >= w && rect.h >= h) {
        const leftoverW = rect.w - w;
        const leftoverH = rect.h - h;
        const shortSide = Math.min(leftoverW, leftoverH);
        if (shortSide < bestShortSideFit) {
          bestShortSideFit = shortSide;
          bestIndex = i;
          bestRotated = false;
        }
      }

      if (allowRotation && rect.w >= h && rect.h >= w) {
        const leftoverW = rect.w - h;
        const leftoverH = rect.h - w;
        const shortSide = Math.min(leftoverW, leftoverH);
        if (shortSide < bestShortSideFit) {
          bestShortSideFit = shortSide;
          bestIndex = i;
          bestRotated = true;
        }
      }
    }

    if (bestIndex === -1) return null;

    const bestRect = this.freeRects[bestIndex];
    const resW = bestRotated ? h : w;
    const resH = bestRotated ? w : h;
    const result = { x: bestRect.x, y: bestRect.y, rotated: bestRotated };

    this.splitFreeRects({ x: result.x, y: result.y, w: resW, h: resH });
    this.pruneFreeRects();
    return result;
  }

  private splitFreeRects(used: Rect) {
    for (let i = 0; i < this.freeRects.length; i++) {
      const free = this.freeRects[i];
      if (used.x < free.x + free.w && used.x + used.w > free.x && used.y < free.h + free.y && used.y + used.h > free.y) {
        if (used.x > free.x) this.freeRects.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
        if (used.x + used.w < free.x + free.w) this.freeRects.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - (used.x + used.w), h: free.h });
        if (used.y > free.y) this.freeRects.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
        if (used.y + used.h < free.y + free.h) this.freeRects.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - (used.y + used.h) });
        this.freeRects.splice(i, 1);
        i--;
      }
    }
  }

  private pruneFreeRects() {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        const r1 = this.freeRects[i], r2 = this.freeRects[j];
        if (r2.x >= r1.x && r2.y >= r1.y && r2.x + r2.w <= r1.x + r1.w && r2.y + r2.h <= r1.y + r1.h) {
          this.freeRects.splice(j, 1); j--; continue;
        }
        if (r1.x >= r2.x && r1.y >= r2.y && r1.x + r1.w <= r2.x + r2.w && r1.y + r1.h <= r2.y + r2.h) {
          this.freeRects.splice(i, 1); i--; break;
        }
      }
    }
  }
}

export async function packImages(
  files: UploadedFile[],
  config: CanvasConfig,
  autoScaleToFit: boolean = true,
  shouldTrim: boolean = true,
  onProgress?: (progress: number) => void
): Promise<PackResult> {
  const { widthCm, heightCm, dpi, padding, allowRotation } = config;
  const canvasWidthPx = Math.floor((widthCm / 2.54) * dpi);
  const canvasHeightPx = Math.floor((heightCm / 2.54) * dpi);
  const paddingPx = Math.floor((padding / 2.54) * dpi);

  const items = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const item = await new Promise<any>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const source = shouldTrim ? trimTransparent(img) : img;
        resolve({ id: f.id, file: f.file, source, w: source.width, h: source.height });
      };
      img.onerror = () => resolve(null);
      img.src = f.preview;
    });
    if (item) items.push(item);
    
    // Пауза кожні 3 файли для оновлення UI
    if (i % 3 === 0) {
      await yieldToMain();
      if (onProgress) onProgress((i + 1) / files.length * 0.4);
    }
  }

  // Покращене сортування для рулонного друку: спочатку найдовші сторони
  items.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || (b.w * b.h) - (a.w * a.h));

  const packer = new MaxRectsPacker(canvasWidthPx, canvasHeightPx);
  const packed: PackedImage[] = [];
  const failed: any[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let w = item.w, h = item.h;

    const maxAllowedW = canvasWidthPx - paddingPx;
    if (autoScaleToFit && (Math.min(w, h) > maxAllowedW)) {
      const scale = maxAllowedW / Math.min(w, h);
      w = Math.floor(w * scale);
      h = Math.floor(h * scale);
    }

    const fit = packer.pack(w + paddingPx, h + paddingPx, allowRotation);
    
    if (fit) {
      const previewUrl = await canvasToBlobUrl(item.source);
      packed.push({
        id: item.id,
        file: item.file,
        source: item.source,
        width: fit.rotated ? h : w,
        height: fit.rotated ? w : h,
        x: fit.x,
        y: fit.y,
        rotated: fit.rotated,
        originalWidth: item.w,
        originalHeight: item.h,
        previewUrl
      });
    } else {
      failed.push({ file: files.find(f => f.id === item.id)!, reason: 'No space' });
    }

    // Пауза під час пакування для плавності
    if (i % 10 === 0) {
      await yieldToMain();
      if (onProgress) onProgress(0.4 + ((i + 1) / items.length * 0.6));
    }
  }

  return { packed, failed };
}
