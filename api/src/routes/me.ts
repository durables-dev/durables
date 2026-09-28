import type { FastifyPluginAsync } from "fastify";
import { currentAccount } from "../services/accounts.js";

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request, reply) => {
    const account = currentAccount(request.headers);
    if (!account) return reply.code(401).send({ error: "Unknown user" });
    return account;
  });
};
