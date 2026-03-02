import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { throwApiError } from "../../common/api-error";
import { AuthService } from "../auth/auth.service";
import { MemoryService } from "./memory.service";

function parseMemoryPath(relativePath?: string | string[]): string {
  if (!relativePath) {
    throwApiError(400, "Invalid memory path");
  }

  const rawPath = Array.isArray(relativePath)
    ? relativePath.join("/")
    : relativePath;
  const decoded = decodeURIComponent(rawPath);
  if (!decoded) {
    throwApiError(400, "Invalid memory path");
  }

  return decoded;
}

@Controller("api/memory")
export class MemoryController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(MemoryService)
    private readonly memoryService: MemoryService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const teacher = await this.authService.requireTeacher(request);
    try {
      return await this.memoryService.list(teacher.id);
    } catch (error) {
      this.memoryService.throwStorageError(error);
    }
  }

  @Get("*path")
  async read(@Req() request: Request, @Param("path") path: string) {
    const teacher = await this.authService.requireTeacher(request);
    try {
      return await this.memoryService.read(teacher.id, parseMemoryPath(path));
    } catch (error) {
      this.memoryService.throwStorageError(error);
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
      return await this.memoryService.write(
        teacher.id,
        parseMemoryPath(path),
        body.content ?? "",
      );
    } catch (error) {
      this.memoryService.throwStorageError(error);
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
      await this.memoryService.remove(teacher.id, parseMemoryPath(path));
      response.status(204);
      return undefined;
    } catch (error) {
      this.memoryService.throwStorageError(error);
    }
  }
}
