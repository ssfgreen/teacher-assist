import { useState } from "react";
import { sendMemoryResponse } from "../../api/chat";
import { useMemoryStore } from "../../stores/memoryStore";
import type { MemoryProposal } from "../../types";

interface MemoryCaptureCardProps {
  sessionId: string | null;
  onSubmitted?: () => Promise<void>;
}

const CATEGORY_LABEL: Record<MemoryProposal["category"], string> = {
  personal: "Personal Preferences",
  pedagogical: "Pedagogical Preferences",
  class: "Class-Based Learnings",
};

export default function MemoryCaptureCard({
  sessionId,
  onSubmitted,
}: MemoryCaptureCardProps) {
  const proposals = useMemoryStore((state) => state.proposals);
  const decisions = useMemoryStore((state) => state.decisions);
  const editProposal = useMemoryStore((state) => state.editProposal);
  const confirmAll = useMemoryStore((state) => state.confirmAll);
  const dismissAll = useMemoryStore((state) => state.dismissAll);
  const confirmProposal = useMemoryStore((state) => state.confirmProposal);
  const dismissProposal = useMemoryStore((state) => state.dismissProposal);
  const removeProposal = useMemoryStore((state) => state.removeProposal);
  const clearProposals = useMemoryStore((state) => state.clearProposals);
  const decisionList = useMemoryStore((state) => state.decisionList);
  const [submitting, setSubmitting] = useState(false);

  if (proposals.length === 0) {
    return null;
  }

  const categories: MemoryProposal["category"][] = [
    "personal",
    "pedagogical",
    "class",
  ];

  const submitDecisions = async (
    items: Array<{
      text: string;
      decision: "confirm" | "dismiss";
      scope: "teacher" | "class";
      classId?: string;
      category?: "personal" | "pedagogical" | "class";
    }>,
    onSuccess: () => void,
  ) => {
    if (!sessionId || submitting || items.length === 0) {
      return;
    }
    setSubmitting(true);
    try {
      await sendMemoryResponse({
        sessionId,
        decisions: items,
      });
      onSuccess();
      if (onSubmitted) {
        await onSubmitted();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mb-3 max-h-[40vh] shrink-0 overflow-y-auto rounded-xl border border-paper-200 bg-surface-muted p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Memory capture</h3>
        <p className="text-xs text-ink-800">
          {proposals.length} awaiting decision
        </p>
      </div>
      <div className="mb-2 flex gap-2">
        <button
          className="rounded-lg border border-paper-300 bg-surface-panel px-2 py-1 text-xs"
          type="button"
          onClick={() => {
            confirmAll();
            const items = decisionList().map((item) => ({
              ...item,
              decision: "confirm" as const,
            }));
            void submitDecisions(items, () => {
              clearProposals();
            });
          }}
          disabled={!sessionId || submitting}
        >
          Confirm All
        </button>
        <button
          className="rounded-lg border border-paper-300 bg-surface-panel px-2 py-1 text-xs"
          type="button"
          onClick={() => {
            dismissAll();
            const items = decisionList().map((item) => ({
              ...item,
              decision: "dismiss" as const,
            }));
            void submitDecisions(items, () => {
              clearProposals();
            });
          }}
          disabled={!sessionId || submitting}
        >
          Dismiss All
        </button>
      </div>
      <div className="space-y-3">
        {categories.map((category) => {
          const grouped = proposals.filter(
            (proposal) => proposal.category === category,
          );
          if (grouped.length === 0) {
            return null;
          }

          return (
            <section key={category} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-800">
                {CATEGORY_LABEL[category]}
              </h4>
              {grouped.map((proposal) => {
                const decision = decisions[proposal.id];
                const scopeLabel =
                  proposal.scope === "class"
                    ? `Class: ${proposal.classId ?? "?"}`
                    : "Teacher";

                return (
                  <article
                    key={proposal.id}
                    className="rounded-lg border border-paper-300 bg-surface-panel p-2"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-paper-100 px-2 py-0.5 text-xs">
                          {scopeLabel}
                        </span>
                        <span className="rounded border border-paper-300 px-2 py-0.5 text-[11px]">
                          {category}
                        </span>
                      </div>
                      <span className="text-xs text-ink-800">
                        {decision?.decision ?? "confirm"}
                      </span>
                    </div>
                    <textarea
                      className="min-h-16 w-full rounded-lg border border-paper-300 bg-surface-input p-2 text-xs"
                      value={decision?.text ?? proposal.text}
                      onChange={(event) =>
                        editProposal(proposal.id, event.target.value)
                      }
                    />
                    <p className="mt-1 text-[11px] text-ink-800">
                      Evidence: {proposal.evidence}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        className="rounded-lg border border-paper-300 bg-surface-panel px-2 py-0.5 text-xs"
                        type="button"
                        onClick={() => {
                          confirmProposal(proposal.id);
                          const item = decisions[proposal.id];
                          if (!item) {
                            return;
                          }
                          void submitDecisions(
                            [{ ...item, decision: "confirm" }],
                            () => {
                              removeProposal(proposal.id);
                            },
                          );
                        }}
                        disabled={!sessionId || submitting}
                      >
                        Confirm
                      </button>
                      <button
                        className="rounded-lg border border-paper-300 bg-surface-panel px-2 py-0.5 text-xs"
                        type="button"
                        onClick={() => {
                          dismissProposal(proposal.id);
                          const item = decisions[proposal.id];
                          if (!item) {
                            return;
                          }
                          void submitDecisions(
                            [{ ...item, decision: "dismiss" }],
                            () => {
                              removeProposal(proposal.id);
                            },
                          );
                        }}
                        disabled={!sessionId || submitting}
                      >
                        Dismiss
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </section>
  );
}
