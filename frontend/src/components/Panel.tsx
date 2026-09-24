import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  testId?: string;
}

/** A framed terminal pane: slim title bar, content fills the rest. */
export function Panel({ title, right, children, className = "", bodyClassName = "", testId }: PanelProps) {
  return (
    <section
      data-testid={testId}
      className={`flex h-full min-h-0 min-w-0 flex-col border border-line bg-panel ${className}`}
    >
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-line px-2.5">
        <h2 className="text-xs font-medium text-dim">{title}</h2>
        {right}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-16 items-center justify-center px-4 text-center text-xs text-faint">
      {children}
    </div>
  );
}
