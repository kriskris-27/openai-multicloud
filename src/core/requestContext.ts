// src/core/requestContext.ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { User } from "@prisma/client";

export type RequestContext = {
  user: User;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => Promise<T>): Promise<T> {
  return storage.run(context, callback);
}

export function getCurrentRequestContext() {
  return storage.getStore();
}
