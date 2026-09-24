"use client";

import { useEffect, useRef, useState } from "react";

export type Flash = "flash-up" | "flash-down" | "";

/**
 * Returns "flash-up" / "flash-down" for a moment whenever `value` changes.
 * The class is applied immediately and removed after a short delay; the CSS
 * transition on .price-cell then fades the highlight out over ~500ms.
 */
export function useFlash(value: number | undefined, holdMs = 120): Flash {
  const prev = useRef<number | undefined>(value);
  const [flash, setFlash] = useState<Flash>("");

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === undefined || value === undefined || before === value) return;
    setFlash(value > before ? "flash-up" : "flash-down");
    const id = setTimeout(() => setFlash(""), holdMs);
    return () => clearTimeout(id);
  }, [value, holdMs]);

  return flash;
}
