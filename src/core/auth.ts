// src/core/auth.ts
import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTVerifyOptions } from "jose";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { upsertIdentityUser } from "./userRepository.js";

const AUTH0_AUTHORIZE_URL = new URL("/authorize", env.AUTH0_ISSUER).toString();
const AUTH0_TOKEN_URL = new URL("/oauth/token", env.AUTH0_ISSUER).toString();
const AUTH0_USERINFO_URL = new URL("/userinfo", env.AUTH0_ISSUER).toString();
const AUTH0_OAUTH_SCOPES = ["openid", "email", "profile", "offline_access"];
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const auth0Jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", env.AUTH0_ISSUER));
export const AUTH0_PROVIDER = "auth0";

type StoredState = {
  createdAt: number;
  nonce: string;
};

const pendingStates = new Map<string, StoredState>();

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [state, record] of pendingStates) {
    if (now - record.createdAt > OAUTH_STATE_TTL_MS) {
      pendingStates.delete(state);
    }
  }
}

function createState(): { state: string; nonce: string } {
  cleanupExpiredStates();
  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, { createdAt: Date.now(), nonce });
  return { state, nonce };
}

function validateState(state: string | null): StoredState | null {
  cleanupExpiredStates();
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

function buildAuth0AuthorizeUrl(state: string, nonce: string) {
  const url = new URL(AUTH0_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.AUTH0_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", AUTH0_OAUTH_SCOPES.join(" "));
  url.searchParams.set("audience", env.AUTH0_AUDIENCE);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

export async function handleAuthLogin(res: ServerResponse) {
  const { state, nonce } = createState();
  const authorizeUrl = buildAuth0AuthorizeUrl(state, nonce);
  res.writeHead(302, { Location: authorizeUrl });
  res.end();
}

type Auth0TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export type Auth0TokenPayload = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

async function exchangeCodeForTokens(code: string): Promise<Auth0TokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: env.AUTH0_CLIENT_ID,
    client_secret: env.AUTH0_CLIENT_SECRET,
    redirect_uri: env.OAUTH_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const response = await fetch(AUTH0_TOKEN_URL, {
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

  return (await response.json()) as Auth0TokenResponse;
}

async function fetchAuth0UserInfo(accessToken: string): Promise<Auth0TokenPayload | null> {
  try {
    const response = await fetch(AUTH0_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Auth0TokenPayload;
    return data;
  } catch (error) {
    logger.warn(`Failed to fetch Auth0 userinfo: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function verifyAuth0Token(
  token: string,
  options?: { nonce?: string; accessToken?: string }
): Promise<Auth0TokenPayload> {
  const getKey = auth0Jwks as JWTVerifyGetKey;
  const allowedAudiences = [env.AUTH0_AUDIENCE, env.AUTH0_CLIENT_ID].filter(Boolean) as string[];

  const verifyOptions: JWTVerifyOptions = {
    issuer: env.AUTH0_ISSUER,
  };

  if (allowedAudiences.length > 1) {
    verifyOptions.audience = allowedAudiences;
  } else if (allowedAudiences.length === 1) {
    const [audience] = allowedAudiences;
    if (audience) {
      verifyOptions.audience = audience;
    }
  }

  const { nonce, accessToken } = options ?? {};
  if (nonce) {
    (verifyOptions as JWTVerifyOptions & { nonce: string }).nonce = nonce;
  }

  const { payload } = await jwtVerify(token, getKey, verifyOptions);

  const typedPayload = payload as Auth0TokenPayload;

  if (!typedPayload.sub) {
    throw new Error("Missing subject (sub) claim in token");
  }

  if (!typedPayload.email) {
    const userInfoToken = accessToken ?? token;
    const userInfo = await fetchAuth0UserInfo(userInfoToken);
    if (userInfo?.email) {
      typedPayload.email = userInfo.email;
      if (userInfo.name !== undefined) {
        typedPayload.name = userInfo.name;
      }
      if (userInfo.picture !== undefined) {
        typedPayload.picture = userInfo.picture;
      }
      if (userInfo.email_verified !== undefined) {
        typedPayload.email_verified = userInfo.email_verified;
      }
    }
  }

  if (!typedPayload.email) {
    throw new Error("Missing email claim in token/userinfo");
  }

  if (typedPayload.email_verified === false) {
    throw new Error("Auth0 account email is not verified");
  }

  return typedPayload;
}

export async function handleAuthCallback(req: IncomingMessage, res: ServerResponse, url: URL) {
  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description") ?? "Unknown error";
    logger.error(`OAuth error from Auth0: ${error} - ${description}`);
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
      throw new Error("Missing id_token in Auth0 response");
    }

    const payload = await verifyAuth0Token(tokens.id_token, {
      nonce: storedState.nonce,
      accessToken: tokens.access_token,
    });
    const user = await upsertIdentityUser(AUTH0_PROVIDER, {
      sub: payload.sub,
      email: payload.email!,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    });

    logger.info(`🔐 Authenticated Auth0 user ${user.email} (${user.id})`);

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
  const targetOrigin = JSON.stringify(new URL(env.APP_BASE_URL).origin);
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
      const targetOrigin = ${targetOrigin};
      window.opener?.postMessage({ type: "authorization_response", payload }, targetOrigin);
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
