// Dedicated Web Worker. Runs the Monte Carlo off the main thread so the UI never
// blocks and progress can stream back for the count-up animations.

import { handleRequest, type WorkerRequest, type WorkerResponse } from "@weltmeister/sim";

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  handleRequest(e.data, (msg: WorkerResponse) => self.postMessage(msg));
};
