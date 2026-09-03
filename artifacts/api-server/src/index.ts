import app from "./app";
import { logger } from "./lib/logger";
import { resolveBindHost, resolvePort } from "./lib/bind";

const port = resolvePort(process.env["PORT"]);
const host = resolveBindHost(process.env["HOST"]);

app.listen(port, host, () => {
  logger.info({ port, host }, "Server listening");
});
