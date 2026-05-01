import { Redis } from "ioredis";

// Standard client for Data (Bitmaps, Rate Limit)
export const redis = new Redis(process.env.REDIS_URL);

// Pub/Sub requires dedicated clients
export const publisher = new Redis(process.env.REDIS_URL);
export const subscriber = new Redis(process.env.REDIS_URL);

redis.on("connect", () => {
  console.log("[Redis] Main Data Connected");
});

publisher.on("connect", () => {
  console.log("[Redis] Publisher Connected");
});
