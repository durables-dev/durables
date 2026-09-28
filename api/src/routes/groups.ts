import type { FastifyPluginAsync } from "fastify";
import type { PublishGroupRequest, ResolveGroupRequest } from "../model/group-version.js";
import { getGroupListing, publishGroup, resolveGroup } from "../services/groups.js";

export const groupsRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ResolveGroupRequest }>("/groups/resolve", async (request) => {
    return resolveGroup(request.headers, request.body);
  });

  app.post<{ Body: PublishGroupRequest }>("/groups", async (request, reply) => {
    return reply.code(201).send(await publishGroup(request.headers, request.body));
  });

  app.get<{ Params: { owner: string; name: string } }>("/groups/:owner/:name", async (request) => {
    const { owner, name } = request.params;
    return getGroupListing(owner, name);
  });

  app.get<{ Params: { owner: string; name: string; version: string } }>("/groups/:owner/:name/:version", async (request) => {
    const { owner, name, version } = request.params;
    return getGroupListing(owner, name, version);
  });
};
