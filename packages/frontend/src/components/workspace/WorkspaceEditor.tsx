import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

import { Crepe } from "@milkdown/crepe";
import { useEffect, useRef } from "react";

interface WorkspaceEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function WorkspaceEditor({
  value,
  onChange,
  disabled = false,
}: WorkspaceEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const editor = new Crepe({
      root,
      defaultValue: initialValueRef.current,
    });

    editor.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown === prevMarkdown) {
          return;
        }
        onChangeRef.current(markdown);
      });
    });

    void editor.create();
    crepeRef.current = editor;

    return () => {
      crepeRef.current = null;
      void editor.destroy();
    };
  }, []);

  useEffect(() => {
    const editor = crepeRef.current;
    if (!editor) {
      return;
    }

    editor.setReadonly(disabled);
  }, [disabled]);

  return (
    <div
      className="workspace-editor min-h-0 flex-1 overflow-hidden rounded-lg border border-paper-100 bg-white"
      aria-label="Workspace file editor"
    >
      <div className="h-full" ref={rootRef} />
    </div>
  );
}
