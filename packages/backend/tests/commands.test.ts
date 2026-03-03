import { describe, expect, it } from "bun:test";

import {
  commandInstructions,
  getCommandDefinition,
  listCommandDefinitions,
} from "../src/commands/catalog";

describe("commands catalog", () => {
  it("lists command definitions with stable ids", () => {
    const commands = listCommandDefinitions();
    const ids = commands.map((command) => command.id);

    expect(ids).toContain("create-lesson");
    expect(ids).toContain("refine-lesson");
    expect(ids).toContain("update-class");
  });

  it("builds command instructions for known commands", () => {
    const instructions = commandInstructions("create-lesson");
    expect(instructions).toContain("Active command:");
    expect(instructions).toContain("create-lesson");
  });

  it("returns empty instructions for unknown commands", () => {
    expect(commandInstructions("not-a-command")).toBe("");
    expect(getCommandDefinition("not-a-command")).toBeUndefined();
  });
});
