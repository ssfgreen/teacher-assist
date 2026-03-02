import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { ChatController } from "./modules/chat/chat.controller";
import { ChatService } from "./modules/chat/chat.service";
import { MemoryController } from "./modules/memory/memory.controller";
import { MemoryService } from "./modules/memory/memory.service";
import { SessionsController } from "./modules/sessions/sessions.controller";
import { SessionsService } from "./modules/sessions/sessions.service";
import { SkillsController } from "./modules/skills/skills.controller";
import { SkillsService } from "./modules/skills/skills.service";
import { WorkspaceController } from "./modules/workspace/workspace.controller";
import { WorkspaceService } from "./modules/workspace/workspace.service";
import { buildTypeOrmOptions } from "./typeorm/options";

@Module({
  imports: [TypeOrmModule.forRoot(buildTypeOrmOptions())],
  controllers: [
    AuthController,
    ChatController,
    SessionsController,
    SkillsController,
    WorkspaceController,
    MemoryController,
  ],
  providers: [
    AuthService,
    ChatService,
    SessionsService,
    SkillsService,
    WorkspaceService,
    MemoryService,
  ],
})
export class AppModule {}
