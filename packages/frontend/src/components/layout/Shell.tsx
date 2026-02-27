import type { ReactNode } from "react";

interface ShellProps {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function Shell({
  header,
  sidebar,
  children,
  sidebarOpen,
  onToggleSidebar,
}: ShellProps) {
  return (
    <div className="min-h-screen bg-paper-50 text-ink-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6">
        <header className="mb-4 rounded-2xl border border-paper-100 bg-white p-4 shadow-sm">
          <div className="mb-3 lg:hidden">
            <button
              className="rounded-lg border border-paper-100 px-3 py-1 text-sm"
              onClick={onToggleSidebar}
              type="button"
            >
              {sidebarOpen ? "Hide sessions" : "Show sessions"}
            </button>
          </div>
          {header}
        </header>
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          <aside
            className={`rounded-2xl border border-paper-100 bg-white p-4 shadow-sm ${sidebarOpen ? "block" : "hidden"} lg:block`}
          >
            {sidebar}
          </aside>
          <main className="rounded-2xl border border-paper-100 bg-white p-4 shadow-sm">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
