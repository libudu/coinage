export function createTraceWorker(): Worker {
  return new Worker(new URL("./trace.worker.ts", import.meta.url), {
    type: "module",
  });
}
