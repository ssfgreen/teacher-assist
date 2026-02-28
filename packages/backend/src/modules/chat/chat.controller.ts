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
import { type ChatRequestBody, ChatService } from "./chat.service";

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
    const teacher = this.authService.requireTeacher(request);

    if (body.stream) {
      await this.chatService.handleChat(teacher.id, body, response);
      return undefined;
    }

    return this.chatService.handleChat(teacher.id, body);
  }
}
