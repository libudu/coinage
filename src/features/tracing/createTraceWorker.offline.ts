import InlineTraceWorker from "./trace.worker?worker&inline";

export function createTraceWorker(): Worker {
  return new InlineTraceWorker();
}
