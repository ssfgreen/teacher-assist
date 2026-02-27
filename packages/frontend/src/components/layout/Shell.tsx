import type { ReactNode } from "react";

interface ShellProps {
  children: ReactNode;
}

export default function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen bg-paper-50 text-ink-900">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-[240px_1fr] gap-6 px-6 py-8">
        <aside className="rounded-2xl border border-paper-100 bg-white/80 p-4 shadow-sm">
          <div className="font-display text-lg">Workspace</div>
          <div className="mt-4 space-y-3 text-sm text-ink-800">
            <div className="rounded-lg border border-paper-100 p-3">
              Sessions
            </div>
            <div className="rounded-lg border border-paper-100 p-3">
              Workspace Files
            </div>
          </div>
        </aside>
        <main className="rounded-2xl border border-paper-100 bg-white p-6 shadow-sm">
          {children}
        </main>
      </div>
    </div>
  );
}
