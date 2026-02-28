import { Suspense, lazy } from "react";

import { parseAssistantSections } from "./assistant-sections";

const ReactMarkdown = lazy(() => import("react-markdown"));

interface AssistantMessageProps {
  content: string;
}

export function AssistantMessage({ content }: AssistantMessageProps) {
  const sections = parseAssistantSections(content);

  if (!sections) {
    return (
      <div className="prose prose-sm max-w-none">
        <Suspense
          fallback={<p className="whitespace-pre-wrap text-sm">{content}</p>}
        >
          <ReactMarkdown>{content}</ReactMarkdown>
        </Suspense>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <section
          key={section.title}
          data-testid="assistant-section"
          className="rounded-lg border border-paper-200 bg-white p-3"
        >
          <h4 className="mb-2 text-sm font-semibold text-ink-900">
            {section.title}
          </h4>
          <div className="prose prose-sm max-w-none">
            <Suspense
              fallback={
                <p className="whitespace-pre-wrap text-sm">
                  {section.content || "No content provided."}
                </p>
              }
            >
              <ReactMarkdown>
                {section.content || "No content provided."}
              </ReactMarkdown>
            </Suspense>
          </div>
        </section>
      ))}
    </div>
  );
}
