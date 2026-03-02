import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthService } from "../auth/auth.service";
import {
  type ChatRequestBody,
  ChatService,
  type MemoryResponseBody,
} from "./chat.service";

@Controller("api/chat")
export class ChatController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(ChatService)
    private readonly chatService: ChatService,
  ) {}

  @Post()
  @HttpCode(200)
  async chat(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: ChatRequestBody,
  ) {
    const teacher = await this.authService.requireTeacher(request);

    if (body.stream) {
      await this.chatService.handleChat(teacher.id, body, request, response);
      return undefined;
    }

    return this.chatService.handleChat(teacher.id, body, request);
  }

  @Post("memory-response")
  @HttpCode(200)
  async memoryResponse(
    @Req() request: Request,
    @Body() body: MemoryResponseBody,
  ) {
    const teacher = await this.authService.requireTeacher(request);
    return this.chatService.handleMemoryResponse(teacher.id, body);
  }
}
