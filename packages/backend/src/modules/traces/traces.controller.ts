import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { TracesService } from "./traces.service";

@Controller()
export class TracesController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(TracesService)
    private readonly tracesService: TracesService,
  ) {}

  @Get("api/traces")
  async list(
    @Req() request: Request,
    @Query("limit") limit?: string,
    @Query("sessionId") sessionId?: string,
  ) {
    const teacher = await this.authService.requireTeacher(request);
    this.authService.assertCanAccessTraceViewer(teacher);

    if (sessionId) {
      return {
        traces: await this.tracesService.listForSession(sessionId, teacher.id),
      };
    }

    const parsedLimit = Number(limit);
    return {
      traces: await this.tracesService.listForTeacher(
        teacher.id,
        Number.isFinite(parsedLimit) ? parsedLimit : 100,
      ),
    };
  }

  @Get("api/traces/:traceId")
  async read(@Req() request: Request, @Param("traceId") traceId: string) {
    const teacher = await this.authService.requireTeacher(request);
    this.authService.assertCanAccessTraceViewer(teacher);
    return this.tracesService.readById(traceId, teacher.id);
  }

  @Get("api/sessions/:sessionId/traces")
  async listForSession(
    @Req() request: Request,
    @Param("sessionId") sessionId: string,
  ) {
    const teacher = await this.authService.requireTeacher(request);
    this.authService.assertCanAccessTraceViewer(teacher);

    return {
      traces: await this.tracesService.listForSession(sessionId, teacher.id),
    };
  }
}
