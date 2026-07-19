import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-secret-change-in-production";
export const COOKIE_NAME = "camchop_session";

export interface AuthedUser {
  id: number;
  name: string;
  email: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthedUser;
  }
}

export function signSession(userId: number): string {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: "30d" });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function loadUser(req: Request): AuthedUser | undefined {
  const token: string | undefined = req.cookies?.[COOKIE_NAME];
  if (!token) return undefined;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const id = Number(typeof payload === "object" ? payload.sub : undefined);
    if (!Number.isInteger(id)) return undefined;
    const row = db
      .prepare("SELECT id, name, email FROM users WHERE id = ?")
      .get(id) as AuthedUser | undefined;
    return row;
  } catch {
    return undefined;
  }
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = loadUser(req);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "You need to sign in first." });
    return;
  }
  next();
}
