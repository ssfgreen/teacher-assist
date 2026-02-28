import { Module } from "@nestjs/common";

import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { ChatController } from "./modules/chat/chat.controller";
import { ChatService } from "./modules/chat/chat.service";
import { SessionsController } from "./modules/sessions/sessions.controller";
import { SessionsService } from "./modules/sessions/sessions.service";
import { WorkspaceController } from "./modules/workspace/workspace.controller";
import { WorkspaceService } from "./modules/workspace/workspace.service";

@Module({
  controllers: [
    AuthController,
    ChatController,
    SessionsController,
    WorkspaceController,
  ],
  providers: [AuthService, ChatService, SessionsService, WorkspaceService],
})
export class AppModule {}
