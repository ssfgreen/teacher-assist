import type { DataSourceOptions } from "typeorm";

import { resolveDatabaseUrl } from "../config";
import { SessionEntity } from "./entities/session.entity";
import { TeacherEntity } from "./entities/teacher.entity";
import { WorkspaceFileEntity } from "./entities/workspace-file.entity";

export function buildTypeOrmOptions(): DataSourceOptions {
  return {
    type: "postgres",
    url: resolveDatabaseUrl(),
    entities: [TeacherEntity, SessionEntity, WorkspaceFileEntity],
    synchronize: false,
    logging: false,
  };
}
