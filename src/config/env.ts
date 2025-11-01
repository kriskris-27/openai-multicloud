// src/config/env.ts
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.string().default("3001"),
  APP_NAME: z.string().default("openai-mcp-app"),
  APP_VERSION: z.string().default("1.0.0"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
});

export const env = EnvSchema.parse(process.env);
