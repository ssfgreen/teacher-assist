import { HttpException } from "@nestjs/common";

export function throwApiError(status: number, message: string): never {
  throw new HttpException({ error: message }, status);
}
