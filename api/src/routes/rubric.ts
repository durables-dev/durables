import type { FastifyPluginAsync } from "fastify";
import { listRubric } from "../services/rubric.js";

export const rubricRoutes: FastifyPluginAsync = async (app) => {
  app.get("/rubric", async () => ({ entries: listRubric() }));
};
