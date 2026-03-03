import { Injectable } from "@nestjs/common";

import { listCommandDefinitions } from "../../commands/catalog";

@Injectable()
export class CommandsService {
  listCommands() {
    return {
      commands: listCommandDefinitions().map((command) => ({
        id: command.id,
        label: command.label,
        description: command.description,
      })),
    };
  }
}
