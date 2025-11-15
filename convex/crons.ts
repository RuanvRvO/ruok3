import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send daily mood check-in emails at 12pm SAST (10am UTC)
crons.daily(
  "send daily mood emails",
  { hourUTC: 10, minuteUTC: 3 }, // 10:00 AM UTC = 12:00 PM SAST
  internal.moodCheckins.sendDailyEmails
);

export default crons;
