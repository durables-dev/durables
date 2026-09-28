import Fastify from "fastify";
import { activitiesRoutes } from "./routes/activities.js";
import { meRoutes } from "./routes/me.js";
import { rubricRoutes } from "./routes/rubric.js";

export function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
  app.register(meRoutes);
  app.register(activitiesRoutes);
  app.register(rubricRoutes);
  return app;
}
