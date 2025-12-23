
export interface PackedImage {
  id: string;
  file: File;
  source: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
  x: number;
  y: number;
  rotated: boolean;
  originalWidth: number;
  originalHeight: number;
  previewUrl: string; // URL of the processed (trimmed/scaled) image
}

export interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  width: number;
  height: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
}

export interface CanvasConfig {
  widthCm: number;
  heightCm: number;
  dpi: number;
  padding: number;
  allowRotation: boolean;
}

export interface PackingStats {
  totalImages: number;
  usedArea: number;
  totalArea: number;
  efficiency: number;
  failedCount: number;
}
