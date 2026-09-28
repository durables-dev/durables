import type { FastifyPluginAsync } from "fastify";
import type { PublishRequest } from "../model/activity-version.js";
import type { Declarations } from "../model/check.js";
import { checkActivity, detectActivity, getListing, publishActivity } from "../services/activities.js";

export const activitiesRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { code: string } }>("/activities/detect", async (request) => {
    return detectActivity(request.body.code);
  });

  app.post<{ Body: { code: string; declarations: Declarations } }>("/activities/check", async (request) => {
    const { code, declarations } = request.body;
    return { checks: checkActivity(code, declarations) };
  });

  app.post<{ Body: PublishRequest }>("/activities", async (request, reply) => {
    return reply.code(201).send(await publishActivity(request.headers, request.body));
  });

  app.get<{ Params: { owner: string; name: string } }>("/activities/:owner/:name", async (request) => {
    const { owner, name } = request.params;
    return getListing(owner, name);
  });

  app.get<{ Params: { owner: string; name: string; version: string } }>(
    "/activities/:owner/:name/:version",
    async (request) => {
      const { owner, name, version } = request.params;
      return getListing(owner, name, version);
    },
  );
};
