import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export default function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={[
        "w-full rounded-lg border border-paper-300 bg-surface-input px-3 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-emerald-600",
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
}
