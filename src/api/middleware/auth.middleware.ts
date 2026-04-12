import type { Request, Response, NextFunction } from "express";
import { config } from "../../config";
import { logger } from "../../logger";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== config.apiKey) {
    logger.warn({ path: req.path, ip: req.ip }, "Unauthorized access attempt");
    res.status(401).json({
      error: "Unauthorized",
      message: "Valid X-API-Key header is required",
    });
    return;
  }

  next();
}
