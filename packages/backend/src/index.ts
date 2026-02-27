import { startServer } from "./server";

const port = Number(process.env.PORT ?? 3001);

const server = await startServer(port);

console.log(
  `teacher-assist backend listening on http://localhost:${server.port}`,
);
