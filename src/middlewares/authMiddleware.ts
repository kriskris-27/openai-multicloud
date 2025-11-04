// src/middlewares/authMiddleware.ts
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!env.API_KEY) {
    next();
    return;
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
