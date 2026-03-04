import { useEffect, useMemo, useState } from "react";

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
    | {
        kind: "approval";
        question: string;
        options: string[];
        allowFreeText: boolean;
        approvalKind: "tool_call" | "skill_selection";
        skills: string[];
        contextSelection?: {
          optional: Array<{
            id: string;
            label: string;
            kind: "workspace" | "memory";
            path?: string;
          }>;
          required: Array<{
            id: string;
            label: string;
            kind: "workspace" | "system";
            path?: string;
          }>;
        };
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
  onApproval: (
    decision:
      | "approve"
      | "always_allow"
      | "deny"
      | "approve_selected"
      | "deny_all",
    selectedSkills?: string[],
    alternateResponse?: string,
    selectedContextIds?: string[],
  ) => void;
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
  onApproval,
}: InteractiveCardProps) {
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [alwaysAllowAll, setAlwaysAllowAll] = useState(false);

  const contextOptional =
    state?.kind === "approval"
      ? (state.contextSelection?.optional ?? null)
      : null;
  const contextRequired =
    state?.kind === "approval"
      ? (state.contextSelection?.required ?? null)
      : null;
  const hasContextSelection =
    (contextOptional?.length ?? 0) > 0 || (contextRequired?.length ?? 0) > 0;

  useEffect(() => {
    if (!contextOptional || !hasContextSelection) {
      return;
    }

    setSelectedContextIds(contextOptional.map((item) => item.id));
    setAlwaysAllowAll(false);
  }, [hasContextSelection, contextOptional]);

  const allowAll = useMemo(() => {
    if (!contextOptional || contextOptional.length === 0) {
      return false;
    }
    return contextOptional.every((item) =>
      selectedContextIds.includes(item.id),
    );
  }, [contextOptional, selectedContextIds]);

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

      {state.kind === "approval" ? (
        <div className="space-y-2">
          {hasContextSelection ? (
            <>
              <h3 className="font-medium">Context gathered</h3>
              <p className="text-sm text-ink-800">{state.question}</p>
              <details
                className="rounded-lg border border-paper-300 bg-surface-panel p-2 text-sm"
                open
              >
                <summary className="cursor-pointer font-medium">
                  Show context added
                </summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-ink-800">
                      Optional context (you choose)
                    </p>
                    <div className="mt-1 space-y-1">
                      {(contextOptional ?? []).map((item) => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContextIds.includes(item.id)}
                            onChange={(event) => {
                              setAlwaysAllowAll(false);
                              if (event.target.checked) {
                                setSelectedContextIds((current) => [
                                  ...new Set([...current, item.id]),
                                ]);
                                return;
                              }
                              setSelectedContextIds((current) =>
                                current.filter((id) => id !== item.id),
                              );
                            }}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-ink-800">
                      Required context (always included)
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-ink-800">
                      {(contextRequired ?? []).map((item) => (
                        <li key={item.id}>{item.label}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>

              <div className="space-y-1 rounded-lg border border-paper-300 bg-surface-panel p-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowAll}
                    onChange={(event) => {
                      setAlwaysAllowAll(false);
                      if (event.target.checked) {
                        setSelectedContextIds(
                          (contextOptional ?? []).map((item) => item.id),
                        );
                        return;
                      }
                      setSelectedContextIds([]);
                    }}
                  />
                  <span>Allow all</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alwaysAllowAll}
                    onChange={(event) => {
                      setAlwaysAllowAll(event.target.checked);
                      if (event.target.checked) {
                        setSelectedContextIds(
                          (contextOptional ?? []).map((item) => item.id),
                        );
                      }
                    }}
                  />
                  <span>Always allow all</span>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    onApproval(
                      alwaysAllowAll ? "always_allow" : "approve",
                      undefined,
                      undefined,
                      selectedContextIds,
                    )
                  }
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-medium">Approval required</h3>
              <p className="text-sm text-ink-800">{state.question}</p>
              {state.approvalKind === "skill_selection" &&
              state.skills.length > 0 ? (
                <div className="space-y-1 rounded-lg border border-paper-300 bg-surface-panel p-2 text-sm">
                  {state.skills.map((skill) => (
                    <label key={skill} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={input.split(",").includes(skill)}
                        onChange={(event) => {
                          const current = new Set(
                            input
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          );
                          if (event.target.checked) {
                            current.add(skill);
                          } else {
                            current.delete(skill);
                          }
                          setInput([...current].join(","));
                        }}
                      />
                      <span>{skill}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {state.allowFreeText ? (
                <textarea
                  className="w-full rounded-lg border border-paper-300 bg-surface-input p-2 text-sm"
                  placeholder="Optional alternate instruction"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
              ) : null}
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    onApproval(
                      state.approvalKind === "skill_selection"
                        ? "approve_selected"
                        : "approve",
                      input
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                >
                  Approve
                </button>
                <button
                  className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    onApproval(
                      "always_allow",
                      input
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                >
                  Always allow
                </button>
                <button
                  className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    onApproval(
                      state.approvalKind === "skill_selection"
                        ? "deny_all"
                        : "deny",
                      undefined,
                      input.trim() || undefined,
                    )
                  }
                >
                  Deny
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
