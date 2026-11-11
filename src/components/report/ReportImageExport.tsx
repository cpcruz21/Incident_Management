'use client';

import { useEffect, useId, useState, type RefObject } from 'react';
import { Download, X } from 'lucide-react';

type SavedImage = { title: string; filename: string; url: string };
type ImageSource = Omit<SavedImage, 'url'> & { panel: RefObject<HTMLElement> };
type ExportState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Filter function to skip UI buttons, action bars, and non-exportable elements
 */
function shouldIncludeNode(node: HTMLElement): boolean {
  if (node.classList) {
    if (
      node.classList.contains('no-export') ||
      node.classList.contains('btn-save-report') ||
      node.classList.contains('weekly-table-action-bar') ||
      node.classList.contains('monthly-sla-toolbar')
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Capture an HTMLElement to PNG data URL using html-to-image with multi-tiered fallback.
 */
async function capturePanel(panel: HTMLElement): Promise<string> {
  const { toPng } = await import('html-to-image');

  // Tier 1: Attempt capture using an unrolled desktop-width clone container
  try {
    return await captureWithClone(panel, toPng);
  } catch (cloneErr) {
    console.warn('Cloned image capture failed, attempting direct capture:', cloneErr);
  }

  // Tier 2: Fall back to capturing the live visible DOM element directly
  try {
    return await captureDirect(panel, toPng, 2);
  } catch (directErr) {
    console.warn('Direct 2x image capture failed, attempting 1x fallback:', directErr);
  }

  // Tier 3: 1x direct capture fallback for low-memory environments
  return await captureDirect(panel, toPng, 1);
}

/**
 * Cloned desktop container capture for full table unrolling
 */
async function captureWithClone(
  panel: HTMLElement,
  toPng: typeof import('html-to-image').toPng
): Promise<string> {
  const host = document.createElement('div');
  host.className = 'report-image-capture-host no-export';
  host.setAttribute('aria-hidden', 'true');
  // NOTE: Never set host.inert = true. Inert subtrees break SVG foreignObject rasterization in Blink.

  const weeklyModule = panel.closest<HTMLElement>('.weekly-report-module');
  if (weeklyModule) {
    host.classList.add('weekly-report-module');
    host.dataset.publicView = weeklyModule.dataset.publicView;
  }

  const monthlyModule = panel.closest<HTMLElement>('.monthly-report-module');
  if (monthlyModule) {
    host.classList.add('monthly-report-module');
    host.dataset.publicView = monthlyModule.dataset.publicView;
  }

  const agingReport = panel.closest<HTMLElement>('.aging-report, .aging-module');
  if (agingReport) {
    host.classList.add('aging-report');
  }

  const scene = document.createElement('div');
  scene.className = 'report-image-capture';

  const copy = panel.cloneNode(true) as HTMLElement;
  scene.append(copy);
  host.append(scene);

  document.body.append(host);
  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const { width, height } = scene.getBoundingClientRect();
    const tableElements = Array.from(copy.querySelectorAll('table'));
    const maxTableScroll = tableElements.reduce((acc, t) => Math.max(acc, t.scrollWidth), 0);
    const effectiveWidth = Math.max(Math.ceil(width), maxTableScroll, 1260);
    const effectiveHeight = Math.max(Math.ceil(height), 220);

    return await toPng(scene, {
      width: effectiveWidth,
      height: effectiveHeight,
      pixelRatio: 2,
      skipFonts: true,
      skipAutoScale: true,
      backgroundColor: '#ffffff',
      filter: shouldIncludeNode,
    });
  } finally {
    host.remove();
  }
}

/**
 * Direct capture of live DOM element
 */
async function captureDirect(
  panel: HTMLElement,
  toPng: typeof import('html-to-image').toPng,
  pixelRatio: number
): Promise<string> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const tableElements = Array.from(panel.querySelectorAll('table'));
  const maxTableScroll = tableElements.reduce((acc, t) => Math.max(acc, t.scrollWidth), 0);
  const targetWidth = Math.max(panel.scrollWidth, maxTableScroll, 1260);

  return await toPng(panel, {
    width: targetWidth,
    height: Math.max(panel.scrollHeight, 220),
    pixelRatio,
    skipFonts: true,
    skipAutoScale: true,
    backgroundColor: '#ffffff',
    filter: shouldIncludeNode,
    style: {
      background: '#ffffff',
      backgroundColor: '#ffffff',
      margin: '0',
      width: `${targetWidth}px`,
      minWidth: `${targetWidth}px`,
      overflow: 'visible',
      overflowX: 'visible',
      overflowY: 'visible',
    },
  });
}

export function ReportImageExport({
  sources,
  dialogTitle,
  period,
}: {
  sources: readonly ImageSource[];
  dialogTitle: string;
  period: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const headingId = useId();
  const [status, setStatus] = useState<ExportState>('idle');
  const [images, setImages] = useState<SavedImage[]>([]);
  const singleImage = sources.length === 1;

  // Close dialog on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  async function prepareImages() {
    setStatus('loading');
    setImages([]);
    try {
      const previews: SavedImage[] = [];
      for (const { panel, title, filename } of sources) {
        if (!panel.current) {
          console.warn(`Panel ref for "${title}" is not available in DOM`);
          continue;
        }
        const url = await capturePanel(panel.current);
        previews.push({ title, filename, url });
      }

      if (previews.length === 0) {
        throw new Error('No target report panels could be captured');
      }

      setImages(previews);
      setStatus('ready');
    } catch (err) {
      console.error('Failed to prepare report images:', err);
      setStatus('error');
    }
  }

  function openPreview() {
    setIsOpen(true);
    void prepareImages();
  }

  function closePreview() {
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="aging-export-action no-export"
        onClick={openPreview}
        disabled={status === 'loading'}
      >
        <Download size={16} aria-hidden="true" /> Save images
      </button>

      {isOpen && (
        <div
          className="report-image-dialog-backdrop no-export"
          onClick={closePreview}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className="report-image-dialog no-export"
            onClick={e => e.stopPropagation()}
          >
            <header>
              <h3 id={headingId}>{dialogTitle}</h3>
              <button
                type="button"
                className="report-image-close"
                aria-label="Close image previews"
                onClick={closePreview}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {status === 'loading' && (
              <p role="status">{singleImage ? 'Preparing PNG…' : 'Preparing PNG images…'}</p>
            )}

            {status === 'error' && (
              <>
                <p role="alert">Could not prepare the export. Try again.</p>
                <button
                  type="button"
                  className="aging-export-action"
                  onClick={() => void prepareImages()}
                >
                  Try again
                </button>
              </>
            )}

            {status === 'ready' && (
              <>
                <p>
                  {singleImage ? 'The image is' : 'Each image is'} rendered in crisp high-resolution PNG.
                </p>
                <div className="report-image-previews">
                  {images.map(image => (
                    <figure key={image.filename}>
                      <img
                        src={image.url}
                        alt={`${image.title} table for ${period || 'the selected report'}`}
                      />
                      <figcaption>
                        <span>{image.title}</span>
                        <a
                          className="aging-export-action"
                          href={image.url}
                          download={image.filename}
                        >
                          <Download size={15} aria-hidden="true" /> Save PNG
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
