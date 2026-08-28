"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface InfoTipProps {
  label: string;
  children: ReactNode;
}

const TIP_WIDTH = 288; // w-72
const GAP = 8;

/**
 * Click-to-toggle info tooltip.
 * Rendered via a portal to document.body so it is NOT clipped by the
 * ScorePanel's overflow container, and positioned with getBoundingClientRect
 * (clamped to the viewport) so it never overflows the DOM on either side.
 */
export function InfoTip({ label, children }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Position BEFORE paint to avoid flicker. Runs after the portal is mounted,
  // so tipRef.current is available for measuring its height.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const tipHeight = tipRef.current?.offsetHeight ?? 120;

    // Prefer growing left (the ScorePanel is anchored right), clamped to viewport.
    let left = rect.right - TIP_WIDTH;
    left = Math.max(GAP, Math.min(left, window.innerWidth - TIP_WIDTH - GAP));

    // Below the button; flip above if it would overflow the bottom.
    let top = rect.bottom + GAP;
    if (top + tipHeight > window.innerHeight - GAP) {
      top = Math.max(GAP, rect.top - tipHeight - GAP);
    }

    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (tipRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    // Any scroll/resize invalidates the position → close.
    function onScrollOrResize() {
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-2 w-2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: TIP_WIDTH,
              zIndex: 100,
            }}
            className="rounded-md border border-border bg-card p-3 text-xs leading-relaxed text-foreground shadow-lg"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}