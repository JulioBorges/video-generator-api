import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../../logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof Error) {
    logger.error({ err, path: req.path }, "Unhandled error");
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
    return;
  }

  logger.error({ err, path: req.path }, "Unknown error");
  res.status(500).json({ error: "Internal server error" });
}
