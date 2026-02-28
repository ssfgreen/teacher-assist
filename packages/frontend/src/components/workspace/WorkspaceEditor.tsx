import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

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
  const extensions = useMemo(
    () => [
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
    ],
    [],
  );

  return (
    <div className="workspace-editor min-h-0 flex-1 overflow-hidden rounded-lg border border-paper-100">
      <CodeMirror
        aria-label="Workspace file editor"
        value={value}
        height="100%"
        minHeight="100%"
        extensions={extensions}
        editable={!disabled}
        onChange={onChange}
        basicSetup={{
          foldGutter: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          lineNumbers: true,
        }}
      />
    </div>
  );
}
