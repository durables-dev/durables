import type { FastifyPluginAsync } from "fastify";
import { getReadmeTemplate } from "../services/readme-template.js";

export const readmeTemplateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/readme-template", async () => getReadmeTemplate());
};
