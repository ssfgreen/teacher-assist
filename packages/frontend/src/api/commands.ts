import type { CommandsApiResponse } from "../types";
import { apiFetch } from "./client";

export async function listCommands(): Promise<CommandsApiResponse> {
  return apiFetch<CommandsApiResponse>("/api/commands");
}
