import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onLinkClick?: (href: string) => void;
}

export default function MarkdownRenderer({
  content,
  className = "",
  onLinkClick,
}: MarkdownRendererProps) {
  const baseClassName =
    "max-w-none text-sm leading-6 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-1 [&_p]:my-2 [&_pre]:overflow-x-auto";

  return (
    <div className={`${baseClassName} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children, ...props }) => {
            const value = href ?? "";
            const isExternal = /^https?:\/\//i.test(value);
            return (
              <a
                {...props}
                href={value}
                onClick={(event) => {
                  if (!value || isExternal || !onLinkClick) {
                    return;
                  }
                  event.preventDefault();
                  onLinkClick(value);
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
