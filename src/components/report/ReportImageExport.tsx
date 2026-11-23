'use client';

import { useEffect, useId, useState, type RefObject } from 'react';
import { Download, X } from 'lucide-react';

type SavedImage = { title: string; filename: string; url: string; cropToPanel?: boolean };
type ImageSource = Omit<SavedImage, 'url'> & { panel: RefObject<HTMLElement>; heading?: string };
type ExportState = 'idle' | 'loading' | 'ready' | 'error';

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

async function capturePanel(panel: HTMLElement, { heading, cropToPanel }: Pick<ImageSource, 'heading' | 'cropToPanel'>): Promise<string> {
  if (cropToPanel) {
    const { toPng } = await import('html-to-image');
    await document.fonts?.ready;
    return toPng(panel, {
      pixelRatio: 2,
      skipFonts: true,
      filter: shouldIncludeNode,
      style: { margin: '0', marginInline: '0' },
    });
  }

  const { renderFullHdPng } = await import('@/lib/report/full-hd-image');

  try {
    return await captureWithClone(panel, renderFullHdPng, heading);
  } catch (cloneErr) {
    console.warn('Cloned image capture failed, attempting direct capture:', cloneErr);
  }

  try {
    return await captureDirect(panel, renderFullHdPng, 2, heading);
  } catch (directErr) {
    console.warn('Direct 2x image capture failed, attempting 1x fallback:', directErr);
  }

  return await captureDirect(panel, renderFullHdPng, 1, heading);
}

async function captureWithClone(
  panel: HTMLElement,
  renderFullHdPng: typeof import('@/lib/report/full-hd-image').renderFullHdPng,
  heading?: string,
): Promise<string> {
  const host = document.createElement('div');
  host.className = 'report-image-capture-host no-export';
  host.setAttribute('aria-hidden', 'true');
  // NOTE: Never set host.inert = true. Inert subtrees break SVG foreignObject rasterization in Blink.

  const scene = document.createElement('div');
  scene.className = 'report-image-capture';

  const copy = panel.cloneNode(true) as HTMLElement;
  scene.append(copy);
  host.append(scene);

  const report = panel.closest('.weekly-report-module, .monthly-report-module, .aging-report');
  (report ?? document.body).append(host);
  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const { width, height } = scene.getBoundingClientRect();
    const tableElements = Array.from(copy.querySelectorAll('table'));
    const maxTableScroll = tableElements.reduce((acc, t) => Math.max(acc, t.scrollWidth), 0);
    const effectiveWidth = Math.max(Math.ceil(width), maxTableScroll, scene.scrollWidth);
    const effectiveHeight = Math.max(Math.ceil(height), scene.scrollHeight);

    return await renderFullHdPng(scene, {
      width: effectiveWidth,
      height: effectiveHeight,
      skipFonts: true,
      filter: shouldIncludeNode,
    }, heading);
  } finally {
    host.remove();
  }
}

async function captureDirect(
  panel: HTMLElement,
  renderFullHdPng: typeof import('@/lib/report/full-hd-image').renderFullHdPng,
  pixelRatio: number,
  heading?: string,
): Promise<string> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const tableElements = Array.from(panel.querySelectorAll('table'));
  const maxTableScroll = tableElements.reduce((acc, t) => Math.max(acc, t.scrollWidth), 0);
  const targetWidth = Math.max(panel.scrollWidth, maxTableScroll, 1260);

  return await renderFullHdPng(panel, {
    width: targetWidth,
    height: Math.max(panel.scrollHeight, 220),
    pixelRatio,
    skipFonts: true,
    filter: shouldIncludeNode,
    style: {
      margin: '0',
      width: `${targetWidth}px`,
      minWidth: `${targetWidth}px`,
      overflow: 'visible',
      overflowX: 'visible',
      overflowY: 'visible',
    },
  }, heading);
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
      for (const { panel, title, filename, heading, cropToPanel } of sources) {
        if (!panel.current) {
          console.warn(`Panel ref for "${title}" is not available in DOM`);
          continue;
        }
        const url = await capturePanel(panel.current, { heading, cropToPanel });
        previews.push({ title, filename, url, cropToPanel });
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
                {images.every(image => !image.cropToPanel) && (
                  <p>{singleImage ? 'The image is' : 'Each image is'} a 1920 × 1080 PNG.</p>
                )}
                <div className="report-image-previews">
                  {images.map(image => (
                    <figure key={image.filename} className={image.cropToPanel ? 'report-image-preview-cropped' : undefined}>
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
