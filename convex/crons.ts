import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send daily mood check-in emails at 4pm SAST (10am UTC)
crons.daily(
  "send daily mood emails",
  { hourUTC: 14, minuteUTC: 0 }, 
  internal.moodCheckins.sendDailyEmails
);

export default crons;
