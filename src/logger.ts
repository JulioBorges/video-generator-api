import pino from "pino";

const logLevel = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { pid: process.pid },
});
