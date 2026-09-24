"use client";

import { useFlash } from "@/hooks/useFlash";
import { fmtNum } from "@/lib/calc";

interface Props {
  price: number;
  testId?: string;
  className?: string;
}

/** A price that flashes green on an uptick and red on a downtick. */
export function PriceCell({ price, testId, className = "" }: Props) {
  const flash = useFlash(price);
  return (
    <span
      data-testid={testId}
      data-price={price}
      data-flash={flash || undefined}
      className={`price-cell num inline-block px-1 ${flash} ${className}`}
    >
      {fmtNum(price)}
    </span>
  );
}
