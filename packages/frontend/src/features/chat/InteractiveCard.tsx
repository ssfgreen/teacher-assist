interface InteractiveCardProps {
  state:
    | {
        kind: "feedforward";
        summary: string;
      }
    | {
        kind: "reflection";
        prompt: string;
      }
    | {
        kind: "adjudication";
        sections: Array<{ id: string; title: string; preview: string }>;
      }
    | {
        kind: "question";
        question: string;
        options: string[];
        allowFreeText: boolean;
      }
    | null;
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  onFeedforward: (
    action: "confirm" | "edit" | "dismiss",
    note?: string,
  ) => void;
  onReflection: (action: "acknowledge" | "skip") => void;
  onAdjudication: (
    action: "accept" | "revise" | "alternatives",
    note?: string,
  ) => void;
  onQuestion: (answer: string) => void;
}

export default function InteractiveCard({
  state,
  input,
  setInput,
  loading,
  onFeedforward,
  onReflection,
  onAdjudication,
  onQuestion,
}: InteractiveCardProps) {
  if (!state) {
    return null;
  }

  return (
    <section className="mb-3 rounded-xl border border-paper-300 bg-surface-muted p-3">
      {state.kind === "feedforward" ? (
        <div className="space-y-2">
          <h3 className="font-medium">Feedforward confirmation</h3>
          <p className="text-sm text-ink-800">{state.summary}</p>
          <textarea
            className="w-full rounded-lg border border-paper-300 bg-surface-input p-2 text-sm"
            placeholder="Optional edit note"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
              type="button"
              disabled={loading}
              onClick={() => onFeedforward("confirm")}
            >
              Confirm
            </button>
            <button
              className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
              type="button"
              disabled={loading}
              onClick={() => onFeedforward("edit", input.trim() || undefined)}
            >
              Edit
            </button>
            <button
              className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
              type="button"
              disabled={loading}
              onClick={() =>
                onFeedforward("dismiss", input.trim() || undefined)
              }
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "reflection" ? (
        <div className="space-y-2">
          <h3 className="font-medium">Reflection prompt</h3>
          <p className="text-sm text-ink-800">{state.prompt}</p>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
              type="button"
              disabled={loading}
              onClick={() => onReflection("acknowledge")}
            >
              Acknowledge
            </button>
            <button
              className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
              type="button"
              disabled={loading}
              onClick={() => onReflection("skip")}
            >
              Skip
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "adjudication" ? (
        <div className="space-y-2">
          <h3 className="font-medium">Adjudication</h3>
          <ul className="space-y-1 text-xs text-ink-800">
            {state.sections.map((section) => (
              <li key={section.id}>
                <strong>{section.title}:</strong> {section.preview}
              </li>
            ))}
          </ul>
          <textarea
            className="w-full rounded-lg border border-paper-300 bg-surface-input p-2 text-sm"
            placeholder="Optional note for revise/alternatives"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
              type="button"
              disabled={loading}
              onClick={() => onAdjudication("accept")}
            >
              Accept
            </button>
            <button
              className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
              type="button"
              disabled={loading}
              onClick={() =>
                onAdjudication("revise", input.trim() || undefined)
              }
            >
              Revise
            </button>
            <button
              className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
              type="button"
              disabled={loading}
              onClick={() =>
                onAdjudication("alternatives", input.trim() || undefined)
              }
            >
              Alternatives
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "question" ? (
        <div className="space-y-2">
          <h3 className="font-medium">Question from assistant</h3>
          <p className="text-sm text-ink-800">{state.question}</p>
          {state.options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {state.options.map((option) => (
                <button
                  key={option}
                  className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
                  type="button"
                  disabled={loading}
                  onClick={() => onQuestion(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
          {state.allowFreeText ? (
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-paper-300 bg-surface-input p-2 text-sm"
                value={input}
                placeholder="Type your answer"
                onChange={(event) => setInput(event.target.value)}
              />
              <button
                className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
                type="button"
                disabled={loading || !input.trim()}
                onClick={() => onQuestion(input.trim())}
              >
                Submit
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
