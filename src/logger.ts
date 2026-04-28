import pino from "pino";

const logLevel = process.env.LOG_LEVEL || "info";
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { pid: process.pid },
  redact: {
    paths: [
      "req.headers.authorization",
      'req.headers["xi-api-key"]',
      'err.config.headers["xi-api-key"]',
      'err.config.headers["Authorization"]',
      "err.config.headers.Authorization",
    ],
    censor: "***REDACTED***",
  },
  serializers: {
    err: (err: any) => {
      if (err?.isAxiosError || err?.response) {
        // Safe extraction of API error messages from response data
        let apiError = err.response?.data;
        
        // Handle Buffer data (OpenAI sends errors as buffers if responseType is arraybuffer)
        if (apiError instanceof Buffer || (apiError?.type === "Buffer" && Array.isArray(apiError.data))) {
          try {
            const buf = apiError instanceof Buffer ? apiError : Buffer.from(apiError.data);
            apiError = JSON.parse(buf.toString());
          } catch {
            apiError = "[Binary/Unparseable Error Data]";
          }
        }

        return {
          type: "AxiosError",
          message: err.message,
          code: err.code,
          status: err.response?.status,
          method: err.config?.method?.toUpperCase(),
          url: err.config?.url,
          apiError: apiError?.error?.message || apiError?.detail?.message || apiError || "Unknown API error",
          stack: logLevel === "debug" ? err.stack : undefined,
        };
      }
      return pino.stdSerializers.err(err);
    },
  },
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "HH:MM:ss",
      },
    },
  }),
});
