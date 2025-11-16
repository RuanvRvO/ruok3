import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send daily mood check-in emails at 12pm SAST (10am UTC)
crons.daily(
  "send daily mood emails",
  { hourUTC: 11, minuteUTC: 51 }, // 11:39 AM UTC = 1:39 PM SAST
  internal.moodCheckins.sendDailyEmails
);

export default crons;
