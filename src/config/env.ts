// src/config/env.ts
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.string().default("3001"),
  APP_NAME: z.string().default("openai-mcp-app"),
  APP_VERSION: z.string().default("1.0.0"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  APP_BASE_URL: z
    .string()
    .url()
    .default(`http://localhost:${process.env.PORT ?? "3001"}`),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AUTH0_ISSUER: z.string().url(),
  AUTH0_CLIENT_ID: z.string(),
  AUTH0_CLIENT_SECRET: z.string(),
  AUTH0_AUDIENCE: z.string(),
  OAUTH_REDIRECT_URI: z.string().url(),
  OAUTH_RESOURCE_ID: z.string().optional(),
});

const parsedEnv = EnvSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  OAUTH_AUTHORIZATION_SERVER: parsedEnv.AUTH0_ISSUER,
  OAUTH_RESOURCE_ID: parsedEnv.OAUTH_RESOURCE_ID ?? parsedEnv.AUTH0_AUDIENCE,
};

            
