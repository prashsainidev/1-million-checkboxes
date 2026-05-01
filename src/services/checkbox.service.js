import { redis } from "../config/redis.js";

// using a single key to store 1M boxes via bitmaps (~125KB footprint)
const CHECKBOX_KEY = "global_checkboxes";

export const toggleCheckbox = async (index, state) => {
  const bitValue = state ? 1 : 0;
  // flip the specific bit in O(1)
  await redis.setbit(CHECKBOX_KEY, index, bitValue);
};

export const getAllCheckboxes = async () => {
  // send raw buffer directly to keep payload small
  const buffer = await redis.getBuffer(CHECKBOX_KEY);
  return buffer;
};
