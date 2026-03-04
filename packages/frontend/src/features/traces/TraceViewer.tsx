import { BarChart3, ChevronDown, ChevronRight, Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listSessionTraces, readTrace } from "../../api/traces";
import type { TraceRecord, TraceSpanKind } from "../../types";

const TRACE_KIND_LABELS: Record<TraceSpanKind, string> = {
  model: "Model",
  tool: "Tool",
  subagent: "Subagent",
  hook: "Hook",
  skill: "Skill",
  feedforward: "Feedforward",
  approval: "Approval",
  reflection: "Reflection",
  adjudication: "Adjudication",
};

function formatCost(value: number): string {
  return `$${value.toFixed(6)}`;
}

export default function TraceViewer({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<TraceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKinds, setActiveKinds] = useState<TraceSpanKind[]>([]);
  const [expandedSpanIds, setExpandedSpanIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setSelectedTrace(null);
    setSelectedTraceId(null);

    void (async () => {
      try {
        const response = await listSessionTraces(sessionId);
        if (cancelled) {
          return;
        }
        setTraces(response.traces);
        const first = response.traces[0] ?? null;
        setSelectedTrace(first);
        setSelectedTraceId(first?.id ?? null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load traces",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const visibleSpans = useMemo(() => {
    const spans = selectedTrace?.spans ?? [];
    if (activeKinds.length === 0) {
      return spans;
    }
    return spans.filter((span) => activeKinds.includes(span.kind));
  }, [selectedTrace?.spans, activeKinds]);

  const kindsInTrace = useMemo(() => {
    const kinds = new Set<TraceSpanKind>();
    for (const span of selectedTrace?.spans ?? []) {
      kinds.add(span.kind);
    }
    return [...kinds];
  }, [selectedTrace?.spans]);

  return (
    <section className="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-col rounded-[20px] border border-paper-200 bg-surface-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Session Traces</h2>
          <p className="text-xs text-ink-700">Session: {sessionId}</p>
        </div>
        <button
          className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
          type="button"
          onClick={onBack}
        >
          Back to chat
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-700">Loading traces...</p>
      ) : null}
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto rounded-xl border border-paper-300 p-2">
            {traces.map((trace) => {
              const selected = trace.id === selectedTraceId;
              return (
                <button
                  key={trace.id}
                  className={`mb-1 w-full rounded-lg border px-2 py-1.5 text-left text-xs transition ${selected ? "border-accent-500 bg-surface-selected" : "border-paper-300 hover:border-paper-400 hover:bg-surface-muted"}`}
                  type="button"
                  onClick={async () => {
                    setSelectedTraceId(trace.id);
                    setSelectedTrace(trace);
                    setError(null);
                    try {
                      const detailed = await readTrace(trace.id);
                      setSelectedTrace(detailed);
                    } catch (readError) {
                      setError(
                        readError instanceof Error
                          ? readError.message
                          : "Failed to load trace",
                      );
                    }
                  }}
                >
                  <p className="truncate font-semibold">{trace.id}</p>
                  <p className="text-[11px] text-ink-700">
                    {new Date(trace.createdAt).toLocaleString()}
                  </p>
                </button>
              );
            })}
            {traces.length === 0 ? (
              <p className="px-1 text-xs text-ink-700">
                No traces recorded yet.
              </p>
            ) : null}
          </aside>

          <div className="min-h-0 overflow-y-auto rounded-xl border border-paper-300 p-3">
            {selectedTrace ? (
              <>
                <div className="mb-3 grid gap-2 rounded-lg border border-paper-300 bg-surface-muted p-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-ink-700">Tokens</p>
                    <p className="font-semibold">
                      {selectedTrace.usage.totalTokens}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-700">Estimated cost</p>
                    <p className="font-semibold">
                      {formatCost(selectedTrace.usage.estimatedCostUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-700">Tool calls</p>
                    <p className="font-semibold">
                      {selectedTrace.summary?.toolCalls ??
                        selectedTrace.steps.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-700">Hooks</p>
                    <p className="font-semibold">
                      {selectedTrace.summary?.hookCalls ?? 0}
                    </p>
                  </div>
                </div>

                <div className="mb-3 rounded-lg border border-paper-300 p-2">
                  <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-ink-800">
                    <Filter className="h-3.5 w-3.5" />
                    Filter spans
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {kindsInTrace.map((kind) => {
                      const active = activeKinds.includes(kind);
                      return (
                        <button
                          key={kind}
                          type="button"
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${active ? "border-accent-500 bg-accent-100 text-accent-700" : "border-paper-300 text-ink-700"}`}
                          onClick={() => {
                            setActiveKinds((current) =>
                              current.includes(kind)
                                ? current.filter((item) => item !== kind)
                                : [...current, kind],
                            );
                          }}
                        >
                          {TRACE_KIND_LABELS[kind]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <ol className="space-y-2">
                  {visibleSpans.map((span) => {
                    const expanded = expandedSpanIds[span.id] ?? false;
                    return (
                      <li
                        key={span.id}
                        className="rounded-lg border border-paper-300 p-2 text-xs"
                      >
                        <button
                          className="flex w-full items-center gap-2 text-left"
                          type="button"
                          onClick={() => {
                            setExpandedSpanIds((current) => ({
                              ...current,
                              [span.id]: !expanded,
                            }));
                          }}
                        >
                          {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-ink-700" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-ink-700" />
                          )}
                          <span className="rounded-full bg-paper-100 px-1.5 py-0.5 text-[11px]">
                            {TRACE_KIND_LABELS[span.kind]}
                          </span>
                          <span className="truncate font-semibold">
                            {span.label}
                          </span>
                          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-700">
                            <BarChart3 className="h-3 w-3" />
                            {span.status}
                          </span>
                        </button>
                        {expanded ? (
                          <div className="mt-2 border-l border-paper-300 pl-2">
                            <p>
                              {new Date(span.startedAt).toLocaleTimeString()} -{" "}
                              {new Date(span.endedAt).toLocaleTimeString()}
                            </p>
                            {span.metadata ? (
                              <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded border border-paper-300 bg-surface-muted p-2">
                                {JSON.stringify(span.metadata, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="text-sm text-ink-700">
                Select a trace to inspect details.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
