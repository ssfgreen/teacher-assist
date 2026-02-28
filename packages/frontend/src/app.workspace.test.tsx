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
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("3C/CLASS.md");

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: "New File" }));

    await waitFor(() => {
      expect(workspaceApi.writeWorkspaceFile).toHaveBeenCalledWith(
        "classes/3C/CLASS.md",
        expect.stringContaining("# New file"),
      );
    });

    promptSpy.mockRestore();
  });

  it("creates a folder inside the selected folder", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("cfe");

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: /curriculum/i }));
    await user.click(screen.getByRole("button", { name: "New Folder" }));

    await waitFor(() => {
      expect(workspaceApi.writeWorkspaceFile).toHaveBeenCalledWith(
        "curriculum/cfe/README.md",
        expect.stringContaining("# Folder Notes"),
      );
    });

    promptSpy.mockRestore();
  });

  it("renames the selected workspace item", async () => {
    const user = userEvent.setup();
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("CLASS-RENAMED.md");

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: "CLASS.md" }));
    await user.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(workspaceApi.renameWorkspacePath).toHaveBeenCalledWith(
        "classes/3B/CLASS.md",
        "classes/3B/CLASS-RENAMED.md",
      );
    });

    promptSpy.mockRestore();
  });
});
