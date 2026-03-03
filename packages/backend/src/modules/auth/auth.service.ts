import { Injectable } from "@nestjs/common";
import type { Request } from "express";

import {
  authenticateFromCookieHeader,
  login as loginWithCredentials,
  logoutFromCookieHeader,
  seedDefaultTeacher,
} from "../../auth";
import { throwApiError } from "../../common/api-error";
import { resolveTraceViewerAllowedEmails } from "../../config";
import type { Teacher } from "../../types";

export type AuthenticatedTeacher = Omit<Teacher, "passwordHash">;

@Injectable()
export class AuthService {
  private readonly traceViewerAllowedEmails = new Set(
    resolveTraceViewerAllowedEmails(),
  );

  async ensureDefaultTeacher(): Promise<void> {
    await seedDefaultTeacher();
  }

  async authenticate(request: Request): Promise<AuthenticatedTeacher | null> {
    return authenticateFromCookieHeader(request.headers.cookie ?? "");
  }

  async requireTeacher(request: Request): Promise<AuthenticatedTeacher> {
    const teacher = await this.authenticate(request);
    if (!teacher) {
      throwApiError(401, "Unauthorized");
    }
    return teacher;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{
    token: string;
    teacher: AuthenticatedTeacher;
  } | null> {
    return loginWithCredentials(email, password);
  }

  logout(request: Request): void {
    logoutFromCookieHeader(request.headers.cookie ?? "");
  }

  canAccessTraceViewer(teacher: { email: string }): boolean {
    return this.traceViewerAllowedEmails.has(teacher.email.toLowerCase());
  }

  assertCanAccessTraceViewer(teacher: { email: string }): void {
    if (!this.canAccessTraceViewer(teacher)) {
      throwApiError(403, "Trace viewer access is restricted");
    }
  }
}
