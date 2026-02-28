import { Controller, Get, Inject, Param, Req } from "@nestjs/common";
import type { Request } from "express";

import { throwApiError } from "../../common/api-error";
import { AuthService } from "../auth/auth.service";
import { SkillsService } from "./skills.service";

@Controller("api/skills")
export class SkillsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(SkillsService)
    private readonly skillsService: SkillsService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    await this.authService.requireTeacher(request);
    return this.skillsService.list();
  }

  @Get(":skillName")
  async read(@Req() request: Request, @Param("skillName") skillName: string) {
    await this.authService.requireTeacher(request);
    try {
      const skill = this.skillsService.read(skillName);
      return {
        target: skill.path,
        tier: skill.tier,
        content: skill.content,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Skill not found";
      throwApiError(404, message);
    }
  }
}
