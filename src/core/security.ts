// src/core/security.ts
export const cspDirectives = {
    "default-src": "'self'",
    "script-src": "'self'",
    "style-src": "'self' 'unsafe-inline'",
    "connect-src": "'self'",
  };
  
  export function buildCspHeader(): string {
    return Object.entries(cspDirectives)
      .map(([key, val]) => `${key} ${val}`)
      .join("; ");
  }
  