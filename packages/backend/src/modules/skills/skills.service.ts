import { Injectable } from "@nestjs/common";

import { listSkillsManifest, readSkillByTarget } from "../../tools/skills";

@Injectable()
export class SkillsService {
  list() {
    return {
      skills: listSkillsManifest(),
    };
  }

  read(target: string) {
    return readSkillByTarget(target);
  }
}
