"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface UpiQrProps {
  value: string;
  size?: number;
  className?: string;
  /** When set, a small download button renders under the QR, saving it as
   * `<downloadName>.png`. Straight off the canvas — no server round trip and
   * nothing stored, same as the QR itself. */
  downloadName?: string;
}

/** Renders a `upi://pay?…` string as a scannable QR, drawn locally onto a
 * canvas (changes-phase13.md §13.1) — nothing is uploaded, stored or fetched,
 * so the code can never fall out of sync with the UPI ID it encodes the way
 * an uploaded QR image silently could.
 *
 * Redraws whenever `value` changes, which is what makes the QR track the
 * amount as it's typed. */
export function UpiQr({ value, size = 176, className = "", downloadName }: UpiQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      // Fixed black-on-white rather than theme tokens: scanners need real
      // contrast, and a themed QR on a dark background is a QR that some
      // phones simply refuse to read.
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch(() => {
      // A failed draw leaves the canvas blank; the UPI ID and deep-link
      // button next to it are still there, so this is degraded, not broken.
    });
  }, [value, size]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${downloadName}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        aria-label="Scan to pay via UPI"
        role="img"
        className="rounded-lg bg-white p-2"
      />
      {downloadName && (
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12" strokeLinecap="round" />
            <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 19h16" strokeLinecap="round" />
          </svg>
          Download
        </button>
      )}
    </div>
  );
}
