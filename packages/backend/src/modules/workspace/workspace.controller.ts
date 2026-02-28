import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { throwApiError } from "../../common/api-error";
import { readWorkspaceFile } from "../../workspace";
import { AuthService } from "../auth/auth.service";
import { WorkspaceService } from "./workspace.service";

function parseWorkspacePath(relativePath?: string | string[]): string {
  if (!relativePath) {
    throwApiError(400, "Invalid workspace path");
  }

  const rawPath = Array.isArray(relativePath)
    ? relativePath.join("/")
    : relativePath;
  const decoded = decodeURIComponent(rawPath);
  if (!decoded) {
    throwApiError(400, "Invalid workspace path");
  }

  return decoded;
}

@Controller("api/workspace")
export class WorkspaceController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(WorkspaceService)
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const teacher = await this.authService.requireTeacher(request);

    try {
      return await this.workspaceService.list(teacher.id);
    } catch (error) {
      this.workspaceService.throwStorageError(error);
    }
  }

  @Post("seed")
  async seed(@Req() request: Request): Promise<{ ok: true }> {
    const teacher = await this.authService.requireTeacher(request);

    try {
      await this.workspaceService.seed(teacher.id);
    } catch (error) {
      this.workspaceService.throwStorageError(error);
    }

    return { ok: true };
  }

  @Post("reset")
  async reset(@Req() request: Request): Promise<{ ok: true }> {
    const teacher = await this.authService.requireTeacher(request);

    try {
      await this.workspaceService.reset(teacher.id);
    } catch (error) {
      this.workspaceService.throwStorageError(error);
    }

    return { ok: true };
  }

  @Post("rename")
  async rename(
    @Req() request: Request,
    @Body() body: { fromPath: string; toPath: string },
  ) {
    const teacher = await this.authService.requireTeacher(request);

    try {
      const result = await this.workspaceService.rename({
        teacherId: teacher.id,
        fromPath: body.fromPath,
        toPath: body.toPath,
      });

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      this.workspaceService.throwRenameError(error);
    }
  }

  @Get("*path")
  async read(@Req() request: Request, @Param("path") path: string) {
    const teacher = await this.authService.requireTeacher(request);

    try {
      const relativePath = parseWorkspacePath(path);
      const content = await readWorkspaceFile(teacher.id, relativePath);
      return {
        path: relativePath,
        content,
      };
    } catch (error) {
      this.workspaceService.throwStorageError(error);
    }
  }

  @Put("*path")
  async write(
    @Req() request: Request,
    @Param("path") path: string,
    @Body() body: { content: string },
  ) {
    const teacher = await this.authService.requireTeacher(request);

    try {
      const relativePath = parseWorkspacePath(path);
      await this.workspaceService.write(
        teacher.id,
        relativePath,
        body.content ?? "",
      );
      return {
        ok: true,
        path: relativePath,
      };
    } catch (error) {
      this.workspaceService.throwStorageError(error);
    }
  }

  @Delete("*path")
  async remove(
    @Req() request: Request,
    @Param("path") path: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const teacher = await this.authService.requireTeacher(request);

    try {
      const relativePath = parseWorkspacePath(path);
      await this.workspaceService.remove(teacher.id, relativePath);
      response.status(204);
      return undefined;
    } catch (error) {
      this.workspaceService.throwDeleteError(error);
    }
  }
}
