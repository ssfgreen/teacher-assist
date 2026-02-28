export interface WorkspaceNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceNode[];
}

export interface LoadedWorkspaceContext {
  assistantIdentity: string;
  workspaceContextSections: Array<{ path: string; content: string }>;
  loadedPaths: string[];
  classRef: string | null;
}
