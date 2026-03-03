import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

interface TextBlockProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-paper-300 bg-surface-panel p-4",
        className ?? "",
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: TextBlockProps): ReactNode {
  return (
    <h2
      className={["text-sm font-semibold", className ?? ""].join(" ")}
      {...props}
    >
      {children}
    </h2>
  );
}

export function CardBody({ className, children, ...props }: TextBlockProps) {
  return (
    <div
      className={["mt-2 text-sm text-ink-800", className ?? ""].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
