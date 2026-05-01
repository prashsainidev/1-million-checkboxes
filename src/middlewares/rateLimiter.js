import { redis } from "../config/redis.js";

// core logic: exactly 1 click allowed every 10 seconds
export const checkRateLimit = async (identifier, limit = 1, window = 10) => {
  const key = `rate_limit:${identifier}`;
  const requests = await redis.incr(key);

  if (requests === 1) {
    await redis.expire(key, window);
  }

  // returns false if user clicks more than 1 time within window
  return requests <= limit;
};
