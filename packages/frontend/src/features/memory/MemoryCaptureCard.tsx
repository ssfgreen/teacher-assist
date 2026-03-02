import { sendMemoryResponse } from "../../api/chat";
import { useMemoryStore } from "../../stores/memoryStore";

interface MemoryCaptureCardProps {
  sessionId: string | null;
  onSubmitted?: () => Promise<void>;
}

export default function MemoryCaptureCard({
  sessionId,
  onSubmitted,
}: MemoryCaptureCardProps) {
  const proposals = useMemoryStore((state) => state.proposals);
  const decisions = useMemoryStore((state) => state.decisions);
  const confirmProposal = useMemoryStore((state) => state.confirmProposal);
  const dismissProposal = useMemoryStore((state) => state.dismissProposal);
  const editProposal = useMemoryStore((state) => state.editProposal);
  const confirmAll = useMemoryStore((state) => state.confirmAll);
  const dismissAll = useMemoryStore((state) => state.dismissAll);
  const clearProposals = useMemoryStore((state) => state.clearProposals);
  const decisionList = useMemoryStore((state) => state.decisionList);

  if (proposals.length === 0) {
    return null;
  }

  const confirmed = decisionList().filter(
    (item) => item.decision === "confirm",
  ).length;
  const dismissed = decisionList().filter(
    (item) => item.decision === "dismiss",
  ).length;

  return (
    <section className="mb-3 rounded-xl border border-paper-200 bg-surface-muted p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Memory capture</h3>
        <p className="text-xs text-ink-800">
          {proposals.length} memories proposed • {confirmed} confirmed •{" "}
          {dismissed} dismissed
        </p>
      </div>
      <div className="mb-2 flex gap-2">
        <button
          className="rounded-lg border border-paper-300 bg-surface-panel px-2 py-1 text-xs"
          type="button"
          onClick={confirmAll}
        >
          Confirm All
        </button>
        <button
          className="rounded-lg border border-paper-300 bg-surface-panel px-2 py-1 text-xs"
          type="button"
          onClick={dismissAll}
        >
          Dismiss All
        </button>
        <button
          className="rounded-lg border border-accent-600 bg-accent-600 px-2 py-1 text-xs text-surface-panel"
          type="button"
          onClick={() => {
            if (!sessionId) {
              return;
            }
            void (async () => {
              await sendMemoryResponse({
                sessionId,
                decisions: decisionList(),
              });
              clearProposals();
              if (onSubmitted) {
                await onSubmitted();
              }
            })();
          }}
          disabled={!sessionId}
        >
          Submit decisions
        </button>
      </div>
      <div className="space-y-2">
        {proposals.map((proposal) => {
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
                <span className="rounded bg-paper-100 px-2 py-0.5 text-xs">
                  {scopeLabel}
                </span>
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
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded-lg border border-paper-300 bg-surface-panel px-2 py-0.5 text-xs"
                  type="button"
                  onClick={() => confirmProposal(proposal.id)}
                >
                  Confirm
                </button>
                <button
                  className="rounded-lg border border-paper-300 bg-surface-panel px-2 py-0.5 text-xs"
                  type="button"
                  onClick={() => dismissProposal(proposal.id)}
                >
                  Dismiss
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
