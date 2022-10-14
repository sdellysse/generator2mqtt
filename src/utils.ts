const logLevels = <const>{
  DEBUG: false,
  INFO: true,
  WARN: true,
};

export const log = Object.assign(
  (message: string) => console.log(`${new Date().toISOString()} ${message}`),
  {
    debug: (message: string) =>
      void (logLevels.DEBUG && log(`[DEBUG] ${message}`)),
    info: (message: string) =>
      void (logLevels.INFO && log(`[INFO] ${message}`)),
    warn: (message: string) =>
      void (logLevels.WARN && log(`[WARN] ${message}`)),
  }
);

export const wait = async (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
