import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send mood check-in emails at 3pm SAST (1pm UTC) on weekdays only
crons.cron(
  "send daily mood emails",
  "0 13 * * 1-5", // At 1pm UTC (3pm SAST) Monday-Friday
  internal.moodCheckins.sendDailyEmails
);

export default crons;
