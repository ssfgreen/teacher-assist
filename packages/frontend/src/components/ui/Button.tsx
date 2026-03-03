import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800",
  secondary:
    "border-paper-300 bg-surface-panel text-ink-950 hover:bg-surface-muted active:bg-paper-100",
  ghost:
    "border-transparent bg-transparent text-ink-900 hover:bg-paper-100 active:bg-paper-200",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASS[variant],
        className ?? "",
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
