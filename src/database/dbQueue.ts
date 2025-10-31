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

export async function enqueuePrivateDb<T>(
  name: string,
  fn: () => Promise<T>,
  maxRetries = 3
) {
  return enqueWithRetries<T>(maxRetries, fn, name, mainDbQueue);
}

export async function enqueueSharedDb<T>(
  name: string,
  fn: () => Promise<T>,
  maxRetries = 3
) {
  return enqueWithRetries<T>(maxRetries, fn, name, logsDbQueue);
}

// Monitor DB queue size every 5s
setInterval(() => {
  console.log(
    `[DB Queue] size: ${mainDbQueue.size}, pending: ${mainDbQueue.pending}`
  );
}, 100000);

function enqueWithRetries<T>(
  maxRetries: number,
  fn: () => Promise<T>,
  name: string,
  dbQueue: PQueue
) {
  return dbQueue.add(async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (err) {
        lastError = err;

        // Handle timeouts or transient network errors
        if (
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.message.includes('ETIMEDOUT'))
        ) {
          console.warn(
            `⏳ DB timeout, retrying attempt ${attempt}/${maxRetries} for ${name}`
          );
          // exponential backoff
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }

        // For other SQL / pool errors, break immediately
        console.error('❌ DB error (non-timeout):', name, err);
        break;
      }
    }

    // All retries failed
    console.error('💥 DB operation failed after retries:', name, lastError);
  });
}
