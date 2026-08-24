"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Draw a signature with a finger, a stylus or a mouse.
 *
 * Pointer events cover all three in one path, so there is no separate touch
 * handling. The canvas is drawn at device pixel density and exported as a PNG
 * data URL, which is what gets stored on the signature row and stamped into
 * the PDF.
 */
export default function SignatureCanvas({
  onChange,
  disabled,
}: {
  /** Fires with a PNG data URL, or null when the pad is cleared. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Size the bitmap to the element and the screen's pixel density, otherwise
  // the line looks soft on a retina display and rough on a phone.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#ffffff";
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  function pointOf(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointOf(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointOf(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = e.currentTarget;
    // Transparent PNG, so the signature sits on whatever is behind it.
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="signature-canvas"
        style={{ touchAction: "none" }}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-doc-muted">
          {hasInk ? "Drawn" : "Sign in the box above"}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="text-xs text-doc-muted underline underline-offset-2 hover:text-white disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
