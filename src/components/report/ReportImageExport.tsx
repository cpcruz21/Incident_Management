'use client';

import { useId, useRef, useState, type RefObject } from 'react';
import { Download, X } from 'lucide-react';

const IMAGE_HEIGHT = 1020;

type SavedImage = { title: string; filename: string; url: string };
type ImageSource = Omit<SavedImage, 'url'> & { panel: RefObject<HTMLElement> };
type ExportState = 'idle' | 'loading' | 'ready' | 'error';

async function capturePanel(panel: HTMLElement) {
  const { toPng } = await import('html-to-image');
  const host = document.createElement('div');
  host.className = 'report-image-capture-host no-export';
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;

  const weeklyModule = panel.closest<HTMLElement>('.weekly-report-module');
  if (weeklyModule) {
    host.classList.add('weekly-report-module');
    host.dataset.publicView = weeklyModule.dataset.publicView;
  }

  const scene = document.createElement('div');
  scene.className = 'report-image-capture';
  const copy = panel.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  scene.append(copy);
  host.append(scene);

  // Measure the full desktop table even when the report is open on a phone.
  document.body.append(host);
  try {
    await document.fonts.ready;
    const { width, height } = scene.getBoundingClientRect();
    return await toPng(scene, {
      width,
      height,
      canvasWidth: Math.round(width * IMAGE_HEIGHT / height),
      canvasHeight: IMAGE_HEIGHT,
      pixelRatio: 1,
      backgroundColor: '#ffffff',
    });
  } finally {
    host.remove();
  }
}

export function ReportImageExport({ sources, dialogTitle, period }: {
  sources: readonly ImageSource[];
  dialogTitle: string;
  period: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [status, setStatus] = useState<ExportState>('idle');
  const [images, setImages] = useState<SavedImage[]>([]);
  const singleImage = sources.length === 1;

  async function prepareImages() {
    setStatus('loading');
    setImages([]);
    try {
      const previews: SavedImage[] = [];
      for (const { panel, title, filename } of sources) {
        if (!panel.current) throw new Error('Report table is unavailable');
        previews.push({ title, filename, url: await capturePanel(panel.current) });
      }
      setImages(previews);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  function openPreview() {
    dialogRef.current?.showModal();
    void prepareImages();
  }

  return (
    <>
      <button type="button" className="aging-export-action no-export" onClick={openPreview} disabled={status === 'loading'}>
        <Download size={16} aria-hidden="true" /> Save images
      </button>
      <dialog ref={dialogRef} className="report-image-dialog no-export" aria-labelledby={headingId}>
        <header>
          <h3 id={headingId}>{dialogTitle}</h3>
          <button type="button" className="report-image-close" aria-label="Close image previews" onClick={() => dialogRef.current?.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {status === 'loading' && <p role="status">{singleImage ? 'Preparing PNG…' : 'Preparing PNG images…'}</p>}
        {status === 'error' && (
          <>
            <p role="alert">Could not prepare the export. Try again.</p>
            <button type="button" className="aging-export-action" onClick={prepareImages}>Try again</button>
          </>
        )}
        {status === 'ready' && (
          <>
            <p>{singleImage ? 'The PNG is' : 'Each PNG is'} {IMAGE_HEIGHT} pixels tall.</p>
            <div className="report-image-previews">
              {images.map(image => (
                <figure key={image.filename}>
                  <img src={image.url} alt={`${image.title} table for ${period || 'the selected report'}`} />
                  <figcaption>
                    <span>{image.title}</span>
                    <a className="aging-export-action" href={image.url} download={image.filename}>
                      <Download size={15} aria-hidden="true" /> Save PNG
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
