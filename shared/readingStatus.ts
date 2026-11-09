/** Reading states supported by saved books throughout the app. */
export const READING_STATUSES = [
  "to_be_read",
  "currently_reading",
  "finished",
] as const;

export type ReadingStatus = (typeof READING_STATUSES)[number];
