// utils/dbQueues.ts
import PQueue from 'p-queue';

// Create two independent queues
export const mainDbQueue = new PQueue({
  concurrency: 1, // one DB operation at a time (safest)
  interval: 1000, // every second
  intervalCap: 4, // at most 3 queries per second
  carryoverConcurrencyCount: true,
});
export const logsDbQueue = new PQueue({
  concurrency: 1, // one DB operation at a time (safest)
  interval: 1000, // every second
  intervalCap: 4, // at most 3 queries per second
  carryoverConcurrencyCount: true,
});

// Helper wrappers
export async function enqueuePrivateDb<T>(fn: () => Promise<T>) {
  return mainDbQueue.add(fn);
}

// Monitor DB queue size every 5s
setInterval(() => {
  console.log(
    `[DB Queue] size: ${mainDbQueue.size}, pending: ${mainDbQueue.pending}`
  );
}, 500000);

export async function enqueueSharedDb<T>(fn: () => Promise<T>) {
  return logsDbQueue.add(fn);
}
