import { writeFileSync } from "node:fs";
import { z } from "zod";
import { format } from "prettier";
import { configurationSchema } from "../src/configuration.js";

writeFileSync(
  new URL("../centerify.config.schema.json", import.meta.url),
  await format(JSON.stringify(z.toJSONSchema(configurationSchema)), { parser: "json" }),
);
