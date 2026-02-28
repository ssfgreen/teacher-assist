import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { buildAuthClearCookie, buildAuthSetCookie } from "../../auth";
import { throwApiError } from "../../common/api-error";
import type { Teacher } from "../../types";
import type { WorkspaceService } from "../workspace/workspace.service";
import type { AuthService } from "./auth.service";

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Post("login")
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ teacher: Omit<Teacher, "passwordHash"> }> {
    await this.authService.ensureDefaultTeacher();

    const result = await this.authService.login(body.email, body.password);
    if (!result) {
      throwApiError(401, "Invalid credentials");
    }

    try {
      await this.workspaceService.seed(result.teacher.id);
    } catch (error) {
      this.workspaceService.throwStorageError(error);
    }

    response.setHeader("set-cookie", buildAuthSetCookie(result.token));
    return {
      teacher: result.teacher,
    };
  }

  @Get("me")
  async me(@Req() request: Request) {
    const teacher = this.authService.requireTeacher(request);

    try {
      await this.workspaceService.seed(teacher.id);
    } catch (error) {
      this.workspaceService.throwStorageError(error);
    }

    return teacher;
  }

  @Post("logout")
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): { ok: true } {
    this.authService.requireTeacher(request);
    this.authService.logout(request);
    response.setHeader("set-cookie", buildAuthClearCookie());
    return { ok: true };
  }
}
