import { type ReactNode, useEffect, useRef, useState } from "react";

interface ShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const MIN_SIDEBAR_PERCENT = 15;
const MAX_SIDEBAR_PERCENT = 35;
const DEFAULT_SIDEBAR_PERCENT = 20;

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_PERCENT, Math.max(MIN_SIDEBAR_PERCENT, width));
}

export default function Shell({
  sidebar,
  children,
  sidebarOpen,
  onToggleSidebar,
}: ShellProps) {
  const [sidebarWidthPercent, setSidebarWidthPercent] = useState(
    DEFAULT_SIDEBAR_PERCENT,
  );
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) {
        return;
      }
      const width = (event.clientX / window.innerWidth) * 100;
      setSidebarWidthPercent(clampSidebarWidth(width));
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  return (
    <div className="h-screen bg-surface-app text-ink-900">
      <div className="mx-auto flex h-full w-full max-w-[1680px] p-2 sm:p-3">
        <aside
          className={`h-full border border-paper-200 bg-surface-sidebar ${sidebarOpen ? "block" : "hidden"} lg:block`}
          style={{ width: `${sidebarWidthPercent}%` }}
        >
          <div className="h-full min-h-0">{sidebar}</div>
        </aside>

        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Resize sidebar"
            className="hidden h-full w-1 cursor-col-resize bg-paper-300 transition hover:bg-accent-500 lg:block"
            onPointerDown={() => {
              isDraggingRef.current = true;
            }}
          />
        ) : null}

        <main className="min-h-0 flex-1 border border-paper-200 bg-surface-main p-4">
          <div className="mb-2 lg:hidden">
            <button
              className="rounded-lg border border-paper-300 px-3 py-1 text-sm"
              onClick={onToggleSidebar}
              type="button"
            >
              {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            </button>
          </div>
          <div className="h-[calc(100%-2.25rem)] lg:h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
