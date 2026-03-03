import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { CommandsService } from "./commands.service";

@Controller("api/commands")
export class CommandsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(CommandsService)
    private readonly commandsService: CommandsService,
  ) {}

  @Get()
  async listCommands(@Req() request: Request) {
    await this.authService.requireTeacher(request);
    return this.commandsService.listCommands();
  }
}
