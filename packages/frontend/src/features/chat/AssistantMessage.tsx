import MarkdownRenderer from "../../components/markdown/MarkdownRenderer";

interface AssistantMessageProps {
  content: string;
}

export function AssistantMessage({ content }: AssistantMessageProps) {
  return <MarkdownRenderer content={content} />;
}
