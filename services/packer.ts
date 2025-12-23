
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

/**
 * Detects non-transparent bounding box and returns a cropped canvas.
 */
function trimTransparent(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return img;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let top = canvas.height, bottom = 0, left = canvas.width, right = 0;
  let found = false;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        found = true;
      }
    }
  }

  if (!found) return img;

  const trimmedWidth = right - left + 1;
  const trimmedHeight = bottom - top + 1;

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  
  if (trimmedCtx) {
    trimmedCtx.drawImage(img, left, top, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
    return trimmedCanvas;
  }

  return img;
}

/**
 * MaxRects Bin Packing Algorithm
 * Highly efficient for variable sized rectangles.
 */
class MaxRectsPacker {
  private freeRects: Rect[] = [];
  private width: number;
  private height: number;
  private padding: number;

  constructor(width: number, height: number, padding: number) {
    this.width = width;
    this.height = height;
    this.padding = padding;
    // Initial free space is the whole canvas
    this.freeRects.push({ x: 0, y: 0, w: width, h: height });
  }

  pack(width: number, height: number, allowRotation: boolean): { x: number; y: number; rotated: boolean } | null {
    let bestRect: Rect | null = null;
    let bestShortSideFit = Number.MAX_VALUE;
    let bestLongSideFit = Number.MAX_VALUE;
    let bestRotated = false;

    // Actual dimensions with padding
    const w = width + this.padding * 2;
    const h = height + this.padding * 2;

    for (const rect of this.freeRects) {
      // Try normal orientation
      if (rect.w >= w && rect.h >= h) {
        const leftoverW = Math.abs(rect.w - w);
        const leftoverH = Math.abs(rect.h - h);
        const shortSideFit = Math.min(leftoverW, leftoverH);
        const longSideFit = Math.max(leftoverW, leftoverH);

        if (shortSideFit < bestShortSideFit || (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
          bestShortSideFit = shortSideFit;
          bestLongSideFit = longSideFit;
          bestRect = rect;
          bestRotated = false;
        }
      }

      // Try rotated orientation
      if (allowRotation && rect.w >= h && rect.h >= w) {
        const leftoverW = Math.abs(rect.w - h);
        const leftoverH = Math.abs(rect.h - w);
        const shortSideFit = Math.min(leftoverW, leftoverH);
        const longSideFit = Math.max(leftoverW, leftoverH);

        if (shortSideFit < bestShortSideFit || (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
          bestShortSideFit = shortSideFit;
          bestLongSideFit = longSideFit;
          bestRect = rect;
          bestRotated = true;
        }
      }
    }

    if (!bestRect) return null;

    const finalW = bestRotated ? h : w;
    const finalH = bestRotated ? w : h;
    const result = { x: bestRect.x, y: bestRect.y, rotated: bestRotated };

    // Split all free rectangles that intersect with the new packed rectangle
    this.splitFreeRects({ x: result.x, y: result.y, w: finalW, h: finalH });
    this.pruneFreeRects();

    return result;
  }

  private splitFreeRects(used: Rect) {
    for (let i = 0; i < this.freeRects.length; i++) {
      const free = this.freeRects[i];
      // Check if intersects
      if (used.x < free.x + free.w && used.x + used.w > free.x &&
          used.y < free.y + free.h && used.y + used.h > free.y) {
        
        // Split free rect into up to 4 new rectangles
        if (used.x > free.x) { // Left
          this.freeRects.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
        }
        if (used.x + used.w < free.x + free.w) { // Right
          this.freeRects.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - (used.x + used.w), h: free.h });
        }
        if (used.y > free.y) { // Top
          this.freeRects.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
        }
        if (used.y + used.h < free.y + free.h) { // Bottom
          this.freeRects.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - (used.y + used.h) });
        }
        
        this.freeRects.splice(i, 1);
        i--;
      }
    }
  }

  private pruneFreeRects() {
    // 1. Remove rectangles contained within others
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        const r1 = this.freeRects[i];
        const r2 = this.freeRects[j];
        
        // If r2 is inside r1
        if (r2.x >= r1.x && r2.y >= r1.y && r2.x + r2.w <= r1.x + r1.w && r2.y + r2.h <= r1.y + r1.h) {
          this.freeRects.splice(j, 1);
          j--;
          continue;
        }
        // If r1 is inside r2
        if (r1.x >= r2.x && r1.y >= r2.y && r1.x + r1.w <= r2.x + r2.w && r1.y + r1.h <= r2.y + r2.h) {
          this.freeRects.splice(i, 1);
          i--;
          break;
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
  
  const canvasWidth = Math.floor((widthCm / 2.54) * dpi);
  const canvasHeight = Math.floor((heightCm / 2.54) * dpi);

  const packed: PackedImage[] = [];
  const failed: { file: UploadedFile; reason: string }[] = [];

  // Step 1: Pre-process
  const items = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const item = await new Promise<{ id: string; file: File; source: HTMLImageElement | HTMLCanvasElement; w: number; h: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const finalSource = shouldTrim ? trimTransparent(img) : img;
        resolve({ 
          id: f.id, 
          file: f.file, 
          source: finalSource, 
          w: finalSource.width, 
          h: finalSource.height 
        });
      };
      img.onerror = () => resolve(null);
      img.src = f.preview;
    });
    if (item) items.push(item);
    if (onProgress) onProgress((i + 1) / files.length * 0.3); // Pre-processing is 30%
  }

  // Step 2: Sorting for better density
  // MaxRects works best when largest items are packed first
  items.sort((a, b) => {
    const areaA = a.w * a.h;
    const areaB = b.w * b.h;
    return areaB - areaA;
  });

  // Step 3: Packing with MaxRects
  const packer = new MaxRectsPacker(canvasWidth, canvasHeight, padding);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let w = item.w;
    let h = item.h;

    // Check if item can even fit after potential scaling
    if (autoScaleToFit && (Math.min(w, h) + padding * 2) > canvasWidth) {
      const minDim = Math.min(w, h);
      const scale = (canvasWidth - padding * 2) / minDim;
      w = Math.floor(w * scale);
      h = Math.floor(h * scale);
    }

    const fit = packer.pack(w, h, allowRotation);

    if (fit) {
      packed.push({
        id: item.id,
        file: item.file,
        source: item.source,
        width: fit.rotated ? h : w,
        height: fit.rotated ? w : h,
        x: fit.x + padding,
        y: fit.y + padding,
        rotated: fit.rotated,
        originalWidth: item.w,
        originalHeight: item.h
      });
    } else {
      failed.push({ file: files.find(f => f.id === item.id)!, reason: 'No space available' });
    }
    
    if (onProgress) onProgress(0.3 + ((i + 1) / items.length * 0.7)); // Packing is 70%
  }

  return { packed, failed };
}
