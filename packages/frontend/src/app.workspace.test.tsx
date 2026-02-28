import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import * as chatApi from "./api/chat";
import * as workspaceApi from "./api/workspace";
import { setupDefaultMocks } from "./test/app-fixtures";

vi.mock("./api/auth");
vi.mock("./api/chat");
vi.mock("./api/sessions");
vi.mock("./api/workspace");
vi.mock("./api/skills");

beforeEach(() => {
  setupDefaultMocks();
});

describe("App workspace", () => {
  it("opens workspace file and shows context indicator metadata", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    await user.click(screen.getByRole("button", { name: "Workspace" }));

    await user.click(screen.getByRole("button", { name: /✦ soul.md/i }));

    await waitFor(() => {
      expect(workspaceApi.readWorkspaceFile).toHaveBeenCalledWith("soul.md");
    });
    await screen.findByText("Assistant Identity");

    expect(screen.queryByPlaceholderText("Type your message...")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back to chat" }));

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops for 3B{enter}");

    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(chatApi.sendChatStream).mock.calls[0]?.[0]).toMatchObject({
      classRef: undefined,
    });

    await screen.findByRole("button", { name: /Used context/i });
  });

  it("creates a file inside the selected folder", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    await user.click(screen.getByRole("button", { name: "Workspace" }));

    await user.click(screen.getByRole("button", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: "Create file" }));
    const input = await screen.findByRole("textbox", {
      name: /New file name input/i,
    });
    await user.clear(input);
    await user.type(input, "3C/CLASS.md{enter}");

    await waitFor(() => {
      expect(workspaceApi.writeWorkspaceFile).toHaveBeenCalledWith(
        "classes/3C/CLASS.md",
        expect.stringContaining("# New file"),
      );
    });
  });

  it("creates a folder inside the selected folder", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    await user.click(screen.getByRole("button", { name: "Workspace" }));

    await user.click(screen.getByRole("button", { name: /curriculum/i }));
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    const input = await screen.findByRole("textbox", {
      name: /New folder name input/i,
    });
    await user.clear(input);
    await user.type(input, "cfe{enter}");

    await waitFor(() => {
      expect(workspaceApi.writeWorkspaceFile).toHaveBeenCalledWith(
        "curriculum/cfe/README.md",
        expect.stringContaining("# Folder Notes"),
      );
    });
  });

  it("renames the selected workspace item inline", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    await user.click(screen.getByRole("button", { name: "Workspace" }));

    await user.click(screen.getByRole("button", { name: /CLASS.md/i }));
    await user.click(screen.getByRole("button", { name: "Rename selected" }));
    const input = await screen.findByDisplayValue("CLASS.md");
    await user.clear(input);
    await user.type(input, "CLASS-RENAMED.md{enter}");

    await waitFor(() => {
      expect(workspaceApi.renameWorkspacePath).toHaveBeenCalledWith(
        "classes/3B/CLASS.md",
        "classes/3B/CLASS-RENAMED.md",
      );
    });
  });

  it("creates CLASS.md when adding a class folder", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    await user.click(screen.getByRole("button", { name: "Workspace" }));

    await user.click(screen.getByRole("button", { name: /^▾ ▣ classes$/i }));
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    const input = await screen.findByRole("textbox", {
      name: /New folder name input/i,
    });
    await user.clear(input);
    await user.type(input, "3D{enter}");

    await waitFor(() => {
      expect(workspaceApi.writeWorkspaceFile).toHaveBeenCalledWith(
        "classes/3D/CLASS.md",
        expect.stringContaining("# Class Profile"),
      );
    });
  });

  it("deletes selected workspace path without modal", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    await user.click(screen.getByRole("button", { name: "Workspace" }));

    await user.click(screen.getByRole("button", { name: /CLASS.md/i }));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));

    await waitFor(() => {
      expect(workspaceApi.deleteWorkspaceFile).toHaveBeenCalledWith(
        "classes/3B/CLASS.md",
      );
    });
  });

  it("shows reset confirmation modal and resets workspace on confirm", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    await user.click(screen.getByRole("button", { name: "Workspace" }));

    await user.click(
      screen.getByRole("button", { name: "Workspace settings" }),
    );
    await user.click(screen.getByRole("button", { name: "Reset workspace" }));
    await screen.findByText("Are you sure you want to do this?");
    await user.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() => {
      expect(workspaceApi.resetWorkspace).toHaveBeenCalledTimes(1);
    });
  });
});
