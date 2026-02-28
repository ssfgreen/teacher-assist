import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import * as authApi from "./api/auth";
import * as chatApi from "./api/chat";
import { setupDefaultMocks, teacher } from "./test/app-fixtures";

vi.mock("./api/auth");
vi.mock("./api/chat");
vi.mock("./api/sessions");
vi.mock("./api/workspace");

beforeEach(() => {
  setupDefaultMocks();
});

describe("App auth and chat", () => {
  it("handles login and streams chat response on Enter", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("Demo Teacher");

    const input = await screen.findByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(1);
    });

    await screen.findByText("Hello world");
  });

  it("uses selected provider and model for chat requests", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "anthropic");
    await user.selectOptions(selects[1], "claude-sonnet-4-6");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Use anthropic{enter}");

    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(chatApi.sendChatStream).mock.calls[0][0]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
  });

  it("shows auth and chat errors", async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(
      new Error("Invalid credentials"),
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Invalid credentials");

    vi.mocked(authApi.login).mockResolvedValueOnce({ teacher });
    vi.mocked(chatApi.sendChatStream).mockRejectedValueOnce(
      new Error("Chat failed"),
    );

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Trigger error{enter}");

    await screen.findByText("Chat failed");
  });

  it("passes selected class reference to chat API", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.selectOptions(screen.getByLabelText("Class context"), "3B");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(chatApi.sendChatStream).mock.calls[0]?.[0]).toMatchObject({
      classRef: "3B",
    });
  });
});
