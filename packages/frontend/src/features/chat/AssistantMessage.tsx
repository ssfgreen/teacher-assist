import MarkdownRenderer from "../../components/markdown/MarkdownRenderer";

interface AssistantMessageProps {
  content: string;
  streaming?: boolean;
}

export function AssistantMessage({
  content,
  streaming = false,
}: AssistantMessageProps) {
  return (
    <div className="relative">
      <MarkdownRenderer content={content} />
      {streaming ? (
        <span
          aria-label="Streaming cursor"
          className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-ink-700 align-middle"
        />
      ) : null}
    </div>
  );
}
