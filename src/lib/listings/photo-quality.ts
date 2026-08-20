export type PhotoQuality = {
  score: number;
  summary: string;
  likelyFloorplan: boolean;
  likelyDim: boolean;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function analyzePixels(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  naturalWidth = width,
  naturalHeight = height,
): PhotoQuality {
  const count = Math.max(1, width * height);
  const lum = new Float32Array(count);
  let sum = 0;
  let sumSq = 0;
  let colorSum = 0;
  let white = 0;
  let dark = 0;

  for (let i = 0; i < count; i += 1) {
    const offset = i * 4;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = y;
    sum += y;
    sumSq += y * y;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    colorSum += spread;
    if (y > 242 && spread < 18) white += 1;
    if (y < 32) dark += 1;
  }

  const mean = sum / count;
  const std = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  const colorfulness = colorSum / count / 255;
  let grad = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const right = x + 1 < width ? (lum[i + 1] ?? lum[i] ?? 0) : (lum[i] ?? 0);
      const down = y + 1 < height ? (lum[i + width] ?? lum[i] ?? 0) : (lum[i] ?? 0);
      const here = lum[i] ?? 0;
      grad += Math.abs(here - right) + Math.abs(here - down);
    }
  }
  const sharpness = grad / count;
  const whiteRatio = white / count;
  const darkRatio = dark / count;
  const likelyFloorplan = whiteRatio > 0.42 && colorfulness < 0.14 && sharpness > 10;
  const likelyDim = mean < 55 || darkRatio > 0.45;
  const likelyBright = mean > 95 && mean < 200 && std > 28;

  const pixels = naturalWidth * naturalHeight;
  let score = 52;
  if (pixels >= 200 * 200) score += 8;
  if (pixels >= 400 * 300) score += 6;
  if (pixels < 80 * 80) score -= 16;
  if (mean >= 80 && mean <= 190) score += 12;
  else if (mean < 50) score -= 18;
  else if (mean > 220) score -= 8;
  if (std > 40) score += 10;
  else if (std < 18) score -= 10;
  if (sharpness > 18) score += 12;
  else if (sharpness < 8) score -= 12;
  if (colorfulness > 0.12 && colorfulness < 0.55) score += 8;
  if (likelyFloorplan) score -= 22;
  if (likelyDim) score -= 16;
  score = Math.round(clamp(score, 5, 98));

  let summary = "Average photos";
  if (likelyFloorplan) summary = "Mostly a floorplan";
  else if (likelyDim) summary = "Dark or muddy photos";
  else if (likelyBright && sharpness > 16) summary = "Bright, clear interior";
  else if (sharpness > 20) summary = "Sharp photos";
  else if (colorfulness < 0.08) summary = "Washed-out photos";

  return {
    score,
    summary,
    likelyFloorplan,
    likelyDim,
    width: naturalWidth,
    height: naturalHeight,
  };
}

export function analyzeImageData(
  image: { width: number; height: number; data: Uint8ClampedArray },
  naturalWidth?: number,
  naturalHeight?: number,
): PhotoQuality {
  return analyzePixels(
    image.width,
    image.height,
    image.data,
    naturalWidth ?? image.width,
    naturalHeight ?? image.height,
  );
}

export async function inspectPhotoUrl(src: string): Promise<PhotoQuality> {
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return {
      score: 50,
      summary: "Photo not scored",
      likelyFloorplan: false,
      likelyDim: false,
      width: 0,
      height: 0,
    };
  }
  const image = await loadImage(src);
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("No canvas");
  }
  ctx.drawImage(image, 0, 0, size, size);
  return analyzeImageData(
    ctx.getImageData(0, 0, size, size),
    image.naturalWidth,
    image.naturalHeight,
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("photo load failed"));
    image.src = src;
  });
}
