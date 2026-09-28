import type { FastifyPluginAsync } from "fastify";
import type { Declarations } from "../model/check.js";
import { checkActivity, detectActivity } from "../services/activities.js";

export const activitiesRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { code: string } }>("/activities/detect", async (request) => {
    return detectActivity(request.body.code);
  });

  app.post<{ Body: { code: string; declarations: Declarations } }>("/activities/check", async (request) => {
    const { code, declarations } = request.body;
    return { checks: checkActivity(code, declarations) };
  });
};
