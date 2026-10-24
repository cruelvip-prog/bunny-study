import React, { useEffect, useRef, useState, useCallback } from 'react';
import { pdfjsLib } from '../utils/pdf';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Move,
  RotateCcw,
  Upload,
  AlertCircle,
  FileText,
  Loader2,
} from 'lucide-react';

interface PdfViewerProps {
  pdfSource: Blob | ArrayBuffer | string | null;
  pdfFileName?: string | null;
  onPdfUpload?: (file: File) => void | Promise<void>;
  className?: string;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfSource,
  pdfFileName,
  onPdfUpload,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.15);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Pan state
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panMode, setPanMode] = useState<boolean>(true);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load PDF document using pdfjs
  useEffect(() => {
    if (!pdfSource) {
      setPdfDoc(null);
      setTotalPages(0);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadDoc = async () => {
      try {
        let loadingTask: any;
        if (typeof pdfSource === 'string') {
          loadingTask = pdfjsLib.getDocument({ url: pdfSource });
        } else if (pdfSource instanceof Blob) {
          const arrayBuffer = await pdfSource.arrayBuffer();
          loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        } else if (pdfSource instanceof ArrayBuffer) {
          loadingTask = pdfjsLib.getDocument({ data: pdfSource });
        }

        const doc = await loadingTask.promise;
        if (!isMounted) return;

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setPanOffset({ x: 0, y: 0 });
        setLoading(false);
      } catch (err: any) {
        console.error('Error loading PDF document:', err);
        if (!isMounted) return;
        setError(err.message || 'Failed to load PDF file in Canvas mode.');
        setLoading(false);
      }
    };

    loadDoc();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfSource]);

  // Render current page on canvas
  const renderPage = useCallback(
    async (pageNum: number, currentScale: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }

        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          setError('This browser could not create a canvas context for the PDF.');
          return;
        }

        const viewport = page.getViewport({ scale: currentScale });
        const pixelRatio = window.devicePixelRatio || 1;

        // High DPI canvas buffer
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);

        // Display style size
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: transform,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
        setError(null);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF rendering error:', err);
          setError(`The PDF page could not be rendered: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    },
    [pdfDoc]
  );

  useEffect(() => {
    if (pdfDoc) {
      renderPage(currentPage, scale);
    }
  }, [pdfDoc, currentPage, scale, renderPage]);

  // Zoom controls
  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 3.5));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.4));
  };

  const handleResetZoom = () => {
    setScale(1.15);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleFitToWidth = async () => {
    if (!pdfDoc || !containerRef.current) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current.clientWidth - 40; // padding
      if (containerWidth > 100 && unscaledViewport.width > 0) {
        const newScale = containerWidth / unscaledViewport.width;
        setScale(Math.max(0.5, Math.min(newScale, 3.0)));
        setPanOffset({ x: 0, y: 0 });
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.warn('Could not fit width:', e);
      setError(`Could not fit this PDF page to the viewer: ${detail}`);
    }
  };

  // Mouse wheel zoom (Ctrl + Wheel or standard wheel zoom)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setScale((prev) => Math.min(Math.max(prev + delta, 0.4), 3.5));
    }
  };

  // Drag-to-pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // only left click
    setIsPanning(true);
    dragStartRef.current = {
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // File upload input trigger
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file || !onPdfUpload) return;
    setUploadError(null);
    try {
      await onPdfUpload(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={`flex h-full min-h-0 flex-col bg-slate-100 ${className}`}>
      {/* Top Toolbar */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm">
        {/* Left: Document Info & Upload */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-blue-700" />
          <span
            className="max-w-[140px] truncate text-xs font-semibold text-slate-700 md:max-w-[200px]"
            title={pdfFileName || 'Question Paper PDF'}
          >
            {pdfFileName || 'NEET Question Paper.pdf'}
          </span>

          {onPdfUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(event) => { void handleFileChange(event); }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                title="Upload another PDF question paper"
              >
                <Upload className="h-3.5 w-3.5 text-blue-700" />
                <span className="hidden sm:inline">Change PDF</span>
              </button>
            </>
          )}
        </div>

        {/* Center: Page Navigation */}
        {totalPages > 0 && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage <= 1}
              className="rounded p-1 text-slate-600 transition hover:bg-white hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              title="Previous Page (Keyboard: [ )"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 text-xs font-mono">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= totalPages) {
                    setCurrentPage(val);
                  }
                }}
                className="w-12 rounded-md border border-slate-300 bg-white px-1 py-1 text-center text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              />
              <span className="text-slate-500">/ {totalPages}</span>
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="rounded p-1 text-slate-600 transition hover:bg-white hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              title="Next Page (Keyboard: ] )"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right: Zoom & Viewer Tools */}
        <div className="flex items-center gap-1">
          <>
            <>
              <button
                onClick={handleZoomOut}
                className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                title="Zoom Out (Ctrl + -)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span
                onClick={handleResetZoom}
                className="cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-600 hover:text-blue-700"
                title="Reset zoom to 100%"
              >
                {Math.round(scale * 100)}%
              </span>

              <button
                onClick={handleZoomIn}
                className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                title="Zoom In (Ctrl + +)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                onClick={handleFitToWidth}
                className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                title="Fit to Width"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setPanMode(!panMode);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className={`p-1.5 rounded transition ${
                  panMode
                    ? 'border border-blue-200 bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-blue-700'
                }`}
                title="Toggle Drag to Pan Mode"
              >
                <Move className="w-4 h-4" />
              </button>

              <button
                onClick={handleResetZoom}
                className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                title="Reset Position & Zoom"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          </>
        </div>
      </div>
      {uploadError && (
        <p role="alert" className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          PDF change failed; the current paper was kept. {uploadError}
        </p>
      )}

      {/* Main PDF View Area */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative flex min-h-0 flex-1 select-none items-center justify-center overflow-auto bg-slate-200 p-3 sm:p-5 ${
          panMode ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
      >
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-100/90 text-slate-700">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Loading question paper...</p>
          </div>
        )}

        {error && (
          <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <h4 className="font-semibold text-rose-900">Unable to Render PDF with Canvas</h4>
            <p className="text-sm text-rose-800">{error}</p>
          </div>
        )}

        {!pdfSource && !loading && !error && (
          <div className="flex flex-col items-center gap-3 p-8 text-center text-slate-600">
            <FileText className="h-12 w-12 text-slate-400" />
            <p className="text-sm font-medium">No Question Paper Loaded</p>
            {onPdfUpload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="min-h-10 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                Upload Question Paper PDF
              </button>
            )}
          </div>
        )}

        {pdfSource && !error && (
          <div
            className="my-auto shadow-lg transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            }}
          >
            <canvas
              ref={canvasRef}
              className="pointer-events-auto mx-auto block rounded-sm bg-white shadow-lg"
            />
          </div>
        )}

      </div>
    </div>
  );
};
