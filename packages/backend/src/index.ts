import { startServer } from "./server";
import { ensureWorkspaceStorageReady } from "./workspace";

const port = Number(process.env.PORT ?? 3001);

await ensureWorkspaceStorageReady();
const server = await startServer(port);

console.log(
  `teacher-assist backend listening on http://localhost:${server.port}`,
);
