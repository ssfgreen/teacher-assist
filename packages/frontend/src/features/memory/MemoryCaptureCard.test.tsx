import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useMemoryStore } from "../../stores/memoryStore";
import MemoryCaptureCard from "./MemoryCaptureCard";

describe("MemoryCaptureCard", () => {
  afterEach(() => {
    act(() => {
      useMemoryStore.setState({
        proposals: [],
        decisions: {},
      });
    });
  });

  it("groups proposals by category and shows evidence snippets", () => {
    act(() => {
      useMemoryStore.getState().setProposals([
        {
          id: "p1",
          text: "Prefers concise output first, then details on request.",
          scope: "teacher",
          category: "personal",
          evidence: "Teacher asked for concise drafts.",
          confidence: 0.9,
          sourcePath: "MEMORY.md",
        },
        {
          id: "p2",
          text: "Uses retrieval starters in most lessons.",
          scope: "teacher",
          category: "pedagogical",
          evidence: "Teacher requested retrieval starter twice.",
          confidence: 0.85,
          sourcePath: "MEMORY.md",
        },
        {
          id: "p3",
          text: "Shorter starters work better for class 3B.",
          scope: "class",
          classId: "3B",
          category: "class",
          evidence: "Teacher revised starter duration to 5 minutes.",
          confidence: 0.88,
          sourcePath: "classes/3B/MEMORY.md",
        },
      ]);
    });

    render(<MemoryCaptureCard sessionId="s1" />);

    expect(screen.getByText("Personal Preferences")).toBeInTheDocument();
    expect(screen.getByText("Pedagogical Preferences")).toBeInTheDocument();
    expect(screen.getByText("Class-Based Learnings")).toBeInTheDocument();
    expect(
      screen.getByText(/Evidence: Teacher revised starter duration/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /submit decisions/i }),
    ).not.toBeInTheDocument();
  });
});
