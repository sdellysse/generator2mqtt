export const log = Object.assign(
  (message: string) => console.log(`${new Date().toISOString()} ${message}`),
  {
    info: (message: string) => log(`[INFO] ${message}`),
    warn: (message: string) => log(`[WARN] ${message}`),
  }
);
