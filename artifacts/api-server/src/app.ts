import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

/**
 * Allowed browser origins. In development anything goes so the Vite dev server
 * on its own port can reach the API; in production the list must be given
 * explicitly, because this server can forward requests on a caller's behalf.
 */
function corsOrigin(): cors.CorsOptions["origin"] {
  const configured = process.env["ALLOWED_ORIGINS"];
  if (configured) {
    const allowed = configured.split(",").map((origin) => origin.trim()).filter(Boolean);
    return (origin, callback) => {
      if (!origin || allowed.includes(origin)) callback(null, true);
      else callback(new Error(`Origin ${origin} is not allowed.`));
    };
  }
  if (process.env["NODE_ENV"] === "production") {
    // Same-origin only: the artifact router serves the frontend and /api together.
    return false;
  }
  return true;
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: corsOrigin() }));
// Request bodies routed through the proxy can be sizeable payloads.
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

app.use("/api", router);

export default app;
