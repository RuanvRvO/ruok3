import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send mood check-in emails at 4pm SAST (2pm UTC) on weekdays only
crons.cron(
  "send daily mood emails",
  "0 14 * * 1-5", // At 2pm UTC (4pm SAST) Monday-Friday
  internal.moodCheckins.sendDailyEmails
);

export default crons;
