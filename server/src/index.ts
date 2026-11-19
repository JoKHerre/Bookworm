import { createApp } from "./app.ts";
import { deleteExpiredSessions } from "./db/session.ts";

// Expired sessions are otherwise only removed when someone tries to use them.
// So clean up every hour
const HOUR_MS = 60 * 60 * 1000;
setInterval(() => {
  deleteExpiredSessions().catch((err) =>
    console.error("Failed to clean up sessions", err),
  );
}, HOUR_MS).unref();

const port = Number(process.env.PORT ?? 3001);
createApp().listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
