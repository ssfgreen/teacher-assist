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

import type { ChatMessage } from "../../types";
import { AuthService } from "../auth/auth.service";
import { SessionsService } from "./sessions.service";

@Controller("api/sessions")
export class SessionsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(SessionsService)
    private readonly sessionsService: SessionsService,
  ) {}

  @Post()
  create(
    @Req() request: Request,
    @Body() body: { provider: string; model: string; messages?: ChatMessage[] },
  ) {
    const teacher = this.authService.requireTeacher(request);
    return this.sessionsService.create({
      teacherId: teacher.id,
      provider: body.provider,
      model: body.model,
      messages: body.messages,
    });
  }

  @Get()
  list(@Req() request: Request) {
    const teacher = this.authService.requireTeacher(request);
    return this.sessionsService.list(teacher.id);
  }

  @Get(":sessionId")
  read(@Req() request: Request, @Param("sessionId") sessionId: string) {
    const teacher = this.authService.requireTeacher(request);
    return this.sessionsService.read(sessionId, teacher.id);
  }

  @Put(":sessionId")
  update(
    @Req() request: Request,
    @Param("sessionId") sessionId: string,
    @Body()
    body: { messages: ChatMessage[]; provider?: string; model?: string },
  ) {
    const teacher = this.authService.requireTeacher(request);
    return this.sessionsService.update({
      sessionId,
      teacherId: teacher.id,
      messages: body.messages,
      provider: body.provider,
      model: body.model,
    });
  }

  @Delete(":sessionId")
  remove(
    @Req() request: Request,
    @Param("sessionId") sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const teacher = this.authService.requireTeacher(request);
    this.sessionsService.remove(sessionId, teacher.id);
    response.status(204);
    return undefined;
  }
}
