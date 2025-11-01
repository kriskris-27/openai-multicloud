// src/core/auth.ts
import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { upsertGoogleUser } from "./userRepository.js";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_SCOPES = ["openid", "email", "profile"];
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");

const googleJwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

type StoredState = {
  createdAt: number;
  nonce: string;
};

const pendingStates = new Map<string, StoredState>();

function createState(): { state: string; nonce: string } {
  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, { createdAt: Date.now(), nonce });
  return { state, nonce };
}

function validateState(state: string | null): StoredState | null {
  if (!state) {
    return null;
  }

  const record = pendingStates.get(state);
  if (!record) {
    return null;
  }

  pendingStates.delete(state);

  if (Date.now() - record.createdAt > OAUTH_STATE_TTL_MS) {
    return null;
  }

  return record;
}

function buildGoogleAuthorizeUrl(state: string, nonce: string) {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

export async function handleAuthLogin(res: ServerResponse) {
  const { state, nonce } = createState();
  const authorizeUrl = buildGoogleAuthorizeUrl(state, nonce);
  res.writeHead(302, { Location: authorizeUrl });
  res.end();
}

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export type GoogleIdTokenPayload = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.OAUTH_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${body}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function verifyGoogleIdToken(
  idToken: string,
  options?: { nonce?: string }
): Promise<GoogleIdTokenPayload> {
  const getKey = googleJwks as Parameters<typeof jwtVerify>[1];
  const { payload } = await jwtVerify(idToken, getKey, {
    audience: env.GOOGLE_CLIENT_ID,
    issuer: GOOGLE_ISSUERS,
    ...(options?.nonce ? { nonce: options.nonce } : {}),
  });

  const typedPayload = payload as GoogleIdTokenPayload;

  if (!typedPayload.sub) {
    throw new Error("Missing subject (sub) claim in ID token");
  }

  if (!typedPayload.email) {
    throw new Error("Missing email claim in ID token");
  }

  if (typedPayload.email_verified === false) {
    throw new Error("Google account email is not verified");
  }

  return typedPayload;
}

export async function handleAuthCallback(req: IncomingMessage, res: ServerResponse, url: URL) {
  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description") ?? "Unknown error";
    logger.error(`OAuth error from Google: ${error} - ${description}`);
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderErrorPage("Authentication failed. Please close this window and try again."));
    return;
  }

  const stateParam = url.searchParams.get("state");
  const storedState = validateState(stateParam);
  if (!storedState) {
    logger.warn("Invalid or expired OAuth state");
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderErrorPage("Authentication session expired. Please close this window and restart login."));
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderErrorPage("Missing authorization code. Please try again."));
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.id_token) {
      throw new Error("Missing id_token in Google response");
    }

    const payload = await verifyGoogleIdToken(tokens.id_token, { nonce: storedState.nonce });
    const user = await upsertGoogleUser({
      sub: payload.sub,
      email: payload.email!,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    });

    logger.info(`🔐 Authenticated Google user ${user.email} (${user.id})`);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderSuccessPage(tokens.id_token, storedState.nonce));
  } catch (tokenError) {
    const message = tokenError instanceof Error ? tokenError.message : String(tokenError);
    logger.error(`Token exchange failed: ${message}`);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderErrorPage("Unable to complete authentication. Please close this window and try again."));
  }
}

function renderSuccessPage(idToken: string, nonce: string) {
  const payload = JSON.stringify({ id_token: idToken, nonce });
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authentication Complete</title>
  </head>
  <body>
    <script>
      const payload = ${payload};
      window.opener?.postMessage({ type: "authorization_response", payload }, "*");
      window.close();
    </script>
    <p>Authentication complete. You may close this window.</p>
  </body>
</html>
`;
}

function renderErrorPage(message: string) {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authentication Error</title>
  </head>
  <body>
    <p>${message}</p>
  </body>
</html>
`;
}
