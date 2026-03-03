import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { ChatController } from "./modules/chat/chat.controller";
import { ChatService } from "./modules/chat/chat.service";
import { CommandsController } from "./modules/commands/commands.controller";
import { CommandsService } from "./modules/commands/commands.service";
import { MemoryController } from "./modules/memory/memory.controller";
import { MemoryService } from "./modules/memory/memory.service";
import { SessionsController } from "./modules/sessions/sessions.controller";
import { SessionsService } from "./modules/sessions/sessions.service";
import { SkillsController } from "./modules/skills/skills.controller";
import { SkillsService } from "./modules/skills/skills.service";
import { TracesController } from "./modules/traces/traces.controller";
import { TracesService } from "./modules/traces/traces.service";
import { WorkspaceController } from "./modules/workspace/workspace.controller";
import { WorkspaceService } from "./modules/workspace/workspace.service";
import { buildTypeOrmOptions } from "./typeorm/options";

@Module({
  imports: [TypeOrmModule.forRoot(buildTypeOrmOptions())],
  controllers: [
    AuthController,
    ChatController,
    CommandsController,
    SessionsController,
    SkillsController,
    TracesController,
    WorkspaceController,
    MemoryController,
  ],
  providers: [
    AuthService,
    ChatService,
    CommandsService,
    SessionsService,
    SkillsService,
    TracesService,
    WorkspaceService,
    MemoryService,
  ],
})
export class AppModule {}
