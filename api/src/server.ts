import { buildApp } from "./app.js";
import { runMigrations } from "./db/schema-migrations-repository.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp();
runMigrations((message) => app.log.info(message))
  .then(() => app.listen({ port, host }))
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
