import "reflect-metadata";

import { createServer } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Express } from "express";

import { AppModule } from "./app.module";
import { seedDefaultTeacher } from "./auth";

export interface RunningServer {
  port: number;
  close: () => Promise<void>;
}

interface AppContext {
  app: INestApplication;
  expressApp: Express;
}

let appContextPromise: Promise<AppContext> | null = null;

async function ensureAppContext(): Promise<AppContext> {
  if (!appContextPromise) {
    appContextPromise = (async () => {
      const expressApp = express();
      const app = await NestFactory.create(
        AppModule,
        new ExpressAdapter(expressApp),
        {
          cors: false,
          logger: false,
        },
      );
      await app.init();
      return { app, expressApp };
    })();
  }

  return appContextPromise;
}

function resolvedPort(
  address: string | null | { port: number },
  fallback: number,
): number {
  if (address && typeof address === "object" && "port" in address) {
    return address.port;
  }

  return fallback;
}

export async function startServer(port = 3001): Promise<RunningServer> {
  await seedDefaultTeacher();

  const { app, expressApp } = await ensureAppContext();
  const server = createServer(expressApp);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port: resolvedPort(server.address(), port),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await app.close();
      appContextPromise = null;
    },
  };
}
