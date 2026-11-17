import { toPng } from 'html-to-image';

const WIDTH = 1920;
const HEIGHT = 1080;

/**
 * Render an HTMLElement into a 1920×1080 PNG data-URL.
 *
 * Strategy:
 *   1.  Use `toPng()` (not `toCanvas`) from html-to-image to get a raw
 *       raster of the element at its natural dimensions.
 *   2.  Draw that raster onto a 1920×1080 canvas, centred and scaled to fit.
 *
 * This avoids the canvasWidth/canvasHeight × pixelRatio double-scaling bug
 * that breaks `toCanvas`-based pipelines.
 */
export async function renderFullHdPng(
  panel: HTMLElement,
  options: {
    width?: number;
    height?: number;
    pixelRatio?: number;
    skipFonts?: boolean;
    backgroundColor?: string;
    filter?: (node: HTMLElement) => boolean;
    style?: Partial<CSSStyleDeclaration>;
  },
  heading?: string,
): Promise<string> {
  const { pixelRatio = 2, skipFonts = true, filter, style, backgroundColor } = options;

  // Step 1 — rasterise the element to a PNG data URL at 2× pixel density
  const rawPng = await toPng(panel, {
    pixelRatio,
    skipFonts,
    filter,
    style,
    backgroundColor: backgroundColor ?? '#ffffff',
    cacheBust: true, // avoid stale image cache
  });

  // Step 2 — load the raster into an Image element
  const img = await loadImage(rawPng);

  // Step 3 — compose onto a 1920×1080 canvas
  const theme = getComputedStyle(panel);
  const bg = backgroundColor ?? (theme.getPropertyValue('--ui-page').trim() || '#ffffff');
  const headingColor = theme.getPropertyValue('--ui-text').trim() || '#0f172a';
  const headingSpace = heading ? 80 : 0;

  // Scale the captured image to fit inside 1920 × (1080 − heading)
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const scale = Math.min(WIDTH / srcW, (HEIGHT - headingSpace) / srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const output = document.createElement('canvas');
  output.width = WIDTH;
  output.height = HEIGHT;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Could not create a canvas for the report image');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const left = Math.floor((WIDTH - dstW) / 2);
  const top = Math.floor((HEIGHT - dstH - headingSpace) / 2);

  if (heading) {
    ctx.fillStyle = headingColor;
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(heading, WIDTH / 2, top + headingSpace / 2, WIDTH - 48);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, left, top + headingSpace, dstW, dstH);

  return output.toDataURL('image/png');
}

/** Load a data-URL (or any URL) into an HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Image load failed: ${e}`));
    img.src = src;
  });
}
