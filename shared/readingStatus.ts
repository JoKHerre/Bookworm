/** Reading states supported by saved books throughout the app. */
export const READING_STATUSES = [
  "to_be_read",
  "currently_reading",
  "finished",
] as const;

export type ReadingStatus = (typeof READING_STATUSES)[number];

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  to_be_read: "To Be Read",
  currently_reading: "Currently Reading",
  finished: "Finished",
};

export const READING_STATUS_OPTIONS = READING_STATUSES.map((value) => ({
  value,
  label: READING_STATUS_LABELS[value],
}));
