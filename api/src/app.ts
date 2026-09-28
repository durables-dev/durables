import Fastify from "fastify";
import { activitiesRoutes } from "./routes/activities.js";
import { groupsRoutes } from "./routes/groups.js";
import { meRoutes } from "./routes/me.js";
import { readmeTemplateRoutes } from "./routes/readme-template.js";
import { rubricRoutes } from "./routes/rubric.js";
import { searchRoutes } from "./routes/search.js";
import { ServiceError } from "./services/errors.js";

export function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ServiceError) {
      return reply.code(error.statusCode).send({ error: error.message, ...error.details });
    }
    return reply.send(error);
  });
  app.register(meRoutes);
  app.register(activitiesRoutes);
  app.register(groupsRoutes);
  app.register(readmeTemplateRoutes);
  app.register(rubricRoutes);
  app.register(searchRoutes);
  return app;
}
