import { v } from "convex/values";
import { mutation, query, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

// Internal mutation to store a mood check-in token for an employee (called by sendDailyEmails)
export const createCheckinToken = internalMutation({
  args: {
    employeeId: v.id("employees"),
    token: v.string(),
    date: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Remove any stale tokens for this employee+date before inserting new one
    const existing = await ctx.db
      .query("moodCheckinTokens")
      .withIndex("by_employee_and_date", (q) =>
        q.eq("employeeId", args.employeeId).eq("date", args.date)
      )
      .collect();
    for (const t of existing) {
      await ctx.db.delete(t._id);
    }
    await ctx.db.insert("moodCheckinTokens", {
      employeeId: args.employeeId,
      token: args.token,
      date: args.date,
      expiresAt: args.expiresAt,
    });
    return null;
  },
});

// Query to check if employee has already submitted today
export const hasSubmittedToday = query({
  args: {
    employeeId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    let employee;
    try {
      employee = await ctx.db.get(args.employeeId as Id<"employees">);
    } catch {
      return false;
    }
    if (!employee) {
      return false;
    }

    const today = new Date().toISOString().split("T")[0];

    const existingCheckin = await ctx.db
      .query("moodCheckins")
      .withIndex("by_employee_and_date", (q) =>
        q.eq("employeeId", args.employeeId as Id<"employees">).eq("date", today)
      )
      .first();

    return existingCheckin !== null;
  },
});

// Mutation to update an existing check-in with additional details
export const updateDetails = mutation({
  args: {
    employeeId: v.id("employees"),
    token: v.string(),
    note: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
  },
  returns: v.id("moodCheckins"),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    const today = new Date().toISOString().split("T")[0];

    // Validate the check-in token from the email link
    const checkinToken = await ctx.db
      .query("moodCheckinTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (
      !checkinToken ||
      checkinToken.employeeId !== args.employeeId ||
      checkinToken.date !== today ||
      checkinToken.expiresAt < Date.now()
    ) {
      throw new Error("Invalid or expired check-in link. Please check your email for the correct link.");
    }

    // Find today's check-in
    const existingCheckin = await ctx.db
      .query("moodCheckins")
      .withIndex("by_employee_and_date", (q) =>
        q.eq("employeeId", args.employeeId).eq("date", today)
      )
      .first();

    if (!existingCheckin) {
      throw new Error("No check-in found for today");
    }

    // Update with additional details
    await ctx.db.patch(existingCheckin._id, {
      note: args.note,
      isAnonymous: args.isAnonymous,
      timestamp: Date.now(),
    });

    return existingCheckin._id;
  },
});

// Mutation to record a mood check-in
export const record = mutation({
  args: {
    employeeId: v.id("employees"),
    token: v.string(),
    mood: v.union(v.literal("green"), v.literal("amber"), v.literal("red")),
    note: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
  },
  returns: v.id("moodCheckins"),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);

    if (!employee) {
      throw new Error("Employee not found");
    }

    if (employee.deletedAt) {
      throw new Error("Employee is no longer active");
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Validate the check-in token from the email link
    const checkinToken = await ctx.db
      .query("moodCheckinTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (
      !checkinToken ||
      checkinToken.employeeId !== args.employeeId ||
      checkinToken.date !== today ||
      checkinToken.expiresAt < Date.now()
    ) {
      throw new Error("Invalid or expired check-in link. Please check your email for the correct link.");
    }

    // Check if employee already submitted today
    const existingCheckin = await ctx.db
      .query("moodCheckins")
      .withIndex("by_employee_and_date", (q) =>
        q.eq("employeeId", args.employeeId).eq("date", today)
      )
      .first();

    if (existingCheckin) {
      // Prevent multiple submissions per day
      throw new Error("ALREADY_SUBMITTED_TODAY");
    }

    // Create new check-in
    const checkinId = await ctx.db.insert("moodCheckins", {
      employeeId: args.employeeId,
      organisation: employee.organisation,
      mood: args.mood,
      note: args.note,
      isAnonymous: args.isAnonymous,
      timestamp: Date.now(),
      date: today,
    });
    return checkinId;
  },
});

// Query to get mood trends for an organization
export const getTrends = query({
  args: {
    days: v.optional(v.number()), // Number of days to look back, default 7
    organisation: v.string(),
  },
  returns: v.array(v.object({
    date: v.string(),
    green: v.number(),
    amber: v.number(),
    red: v.number(),
    total: v.number(),
    employeeCount: v.number(),
    greenPercent: v.number(),
    amberPercent: v.number(),
    redPercent: v.number(),
  })),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership) {
      return [];
    }

    const organisation = args.organisation;

    const days = args.days || 7;
    const trends = [];

    // Get all employees for this organization (including soft-deleted ones for historical accuracy)
    const allEmployees = await ctx.db
      .query("employees")
      .withIndex("by_organisation", (q) => q.eq("organisation", organisation))
      .collect();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      // Calculate timestamps for this day
      const dayStartTimestamp = new Date(dateStr).getTime();
      // Emails are sent at 1pm UTC (3pm SAST) — only count employees active at send time
      const emailSendTimestamp = dayStartTimestamp + 13 * 60 * 60 * 1000;

      // Count employees that existed on this day (should match how many got emails):
      // - Created before the email was sent
      // - Either not deleted, or deleted on/after the email send time (so they got the email)
      const employeeCountOnDay = allEmployees.filter(emp => {
        const wasCreated = emp.createdAt < emailSendTimestamp;
        const wasNotDeleted = !emp.deletedAt || emp.deletedAt >= emailSendTimestamp;
        return wasCreated && wasNotDeleted;
      }).length;

      const checkins = await ctx.db
        .query("moodCheckins")
        .withIndex("by_organisation_and_date", (q) =>
          q.eq("organisation", organisation).eq("date", dateStr)
        )
        .collect();

      const green = checkins.filter((c) => c.mood === "green").length;
      const amber = checkins.filter((c) => c.mood === "amber").length;
      const red = checkins.filter((c) => c.mood === "red").length;
      const total = checkins.length;

      trends.push({
        date: dateStr,
        green,
        amber,
        red,
        total,
        employeeCount: employeeCountOnDay,
        greenPercent: total > 0 ? Math.round((green / total) * 100) : 0,
        amberPercent: total > 0 ? Math.round((amber / total) * 100) : 0,
        redPercent: total > 0 ? Math.round((red / total) * 100) : 0,
      });
    }

    return trends;
  },
});

const checkinWithEmployeeValidator = v.object({
  _id: v.id("moodCheckins"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  organisation: v.string(),
  mood: v.union(v.literal("green"), v.literal("amber"), v.literal("red")),
  note: v.optional(v.string()),
  isAnonymous: v.optional(v.boolean()),
  timestamp: v.number(),
  date: v.string(),
  employeeName: v.optional(v.string()),
  employeeEmail: v.optional(v.string()),
  employee: v.object({
    _id: v.id("employees"),
    _creationTime: v.number(),
    firstName: v.string(),
    email: v.string(),
    organisation: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  }),
});

// Query to get check-ins from the last 24 hours for an organization
export const getTodayCheckins = query({
  args: {
    organisation: v.string(),
  },
  returns: v.array(checkinWithEmployeeValidator),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership) {
      return [];
    }

    const organisation = args.organisation;

    // Get the last 24 hours of check-ins
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    // Get today and yesterday's dates to query both
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString().split("T")[0];

    // Fetch check-ins from both today and yesterday
    const [todayCheckins, yesterdayCheckins] = await Promise.all([
      ctx.db
        .query("moodCheckins")
        .withIndex("by_organisation_and_date", (q) =>
          q.eq("organisation", organisation).eq("date", today)
        )
        .collect(),
      ctx.db
        .query("moodCheckins")
        .withIndex("by_organisation_and_date", (q) =>
          q.eq("organisation", organisation).eq("date", yesterday)
        )
        .collect()
    ]);

    // Combine and filter by timestamp to get only last 24 hours
    const allCheckins = [...todayCheckins, ...yesterdayCheckins];
    const recentCheckins = allCheckins.filter(c => c.timestamp >= twentyFourHoursAgo);

    // Get employee details for each check-in
    const checkinsWithEmployees = await Promise.all(
      recentCheckins.map(async (checkin) => {
        const employee = await ctx.db.get(checkin.employeeId);
        return {
          ...checkin,
          employeeName: employee?.firstName,
          employeeEmail: employee?.email,
          employee,
        };
      })
    );

    // Keep all check-ins (including from deleted employees) for recent check-ins view
    // Only filter out if employee record is missing (data integrity)
    return checkinsWithEmployees
      .filter(c => c.employee !== null)
      .map(c => ({ ...c, employee: c.employee! }));
  },
});

// Query to get check-ins from the last 24 hours for a specific group
export const getGroupTodayCheckins = query({
  args: {
    groupId: v.id("groups"),
    organisation: v.string(),
  },
  returns: v.array(checkinWithEmployeeValidator),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership) {
      return [];
    }

    const organisation = args.organisation;

    // Get all members of the group
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    // Get the last 24 hours of check-ins
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    // Include employees removed in the last 24 hours (they may have responded before removal)
    const relevantMemberships = memberships.filter(m =>
      !m.removedAt || m.removedAt >= twentyFourHoursAgo
    );
    const employeeIds = relevantMemberships.map((m) => m.employeeId);

    // Get today and yesterday's dates to query both
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString().split("T")[0];

    // Fetch check-ins from both today and yesterday
    const [todayCheckins, yesterdayCheckins] = await Promise.all([
      ctx.db
        .query("moodCheckins")
        .withIndex("by_organisation_and_date", (q) =>
          q.eq("organisation", organisation).eq("date", today)
        )
        .collect(),
      ctx.db
        .query("moodCheckins")
        .withIndex("by_organisation_and_date", (q) =>
          q.eq("organisation", organisation).eq("date", yesterday)
        )
        .collect()
    ]);

    // Combine and filter by timestamp to get only last 24 hours
    const allCheckins = [...todayCheckins, ...yesterdayCheckins];
    const recentCheckins = allCheckins.filter(c => c.timestamp >= twentyFourHoursAgo);

    // Filter to only include employees in this group
    const groupCheckins = recentCheckins.filter((c) =>
      employeeIds.includes(c.employeeId)
    );

    // Get employee details for each check-in
    const checkinsWithEmployees = await Promise.all(
      groupCheckins.map(async (checkin) => {
        const employee = await ctx.db.get(checkin.employeeId);
        return {
          ...checkin,
          employeeName: employee?.firstName,
          employeeEmail: employee?.email,
          employee,
        };
      })
    );

    // Keep all check-ins (including from deleted employees) for recent check-ins view
    // Only filter out if employee record is missing (data integrity)
    return checkinsWithEmployees
      .filter(c => c.employee !== null)
      .map(c => ({ ...c, employee: c.employee! }));
  },
});

// Query to get historical check-ins for organization (excluding today)
export const getHistoricalCheckins = query({
  args: {
    days: v.optional(v.number()), // Number of days to look back, default 30
    organisation: v.string(),
  },
  returns: v.array(checkinWithEmployeeValidator),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership) {
      return [];
    }

    const organisation = args.organisation;

    const days = args.days || 30;

    // Build date strings for the past N days, excluding today
    const dateStrings = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (i + 1));
      return date.toISOString().split("T")[0];
    });

    // Fetch all days in parallel
    const checkinsByDay = await Promise.all(
      dateStrings.map((dateStr) =>
        ctx.db
          .query("moodCheckins")
          .withIndex("by_organisation_and_date", (q) =>
            q.eq("organisation", organisation).eq("date", dateStr)
          )
          .collect()
      )
    );

    // Flatten and keep only check-ins with notes
    const allCheckins = checkinsByDay
      .flat()
      .filter((c) => c.note && c.note.trim().length > 0);

    // Get employee details for each check-in
    const checkinsWithEmployees = await Promise.all(
      allCheckins.map(async (checkin) => {
        const employee = await ctx.db.get(checkin.employeeId);
        return {
          ...checkin,
          employeeName: employee?.firstName,
          employeeEmail: employee?.email,
          employee,
        };
      })
    );

    // Keep all historical check-ins (including from deleted employees) and sort by most recent first
    // Only filter out if employee record is missing (data integrity)
    return checkinsWithEmployees
      .filter(c => c.employee !== null)
      .map(c => ({ ...c, employee: c.employee! }))
      .sort((a, b) => b.timestamp - a.timestamp);
  },
});

// Query to get mood trends for a specific group
export const getGroupTrends = query({
  args: {
    groupId: v.id("groups"),
    days: v.optional(v.number()), // Number of days to look back, default 7
    organisation: v.string(),
  },
  returns: v.array(v.object({
    date: v.string(),
    green: v.number(),
    amber: v.number(),
    red: v.number(),
    total: v.number(),
    employeeCount: v.number(),
    greenPercent: v.number(),
    amberPercent: v.number(),
    redPercent: v.number(),
  })),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership) {
      return [];
    }

    const organisation = args.organisation;

    // Get all members of the group (including removed ones for historical accuracy)
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    // Include all employeeIds (even from removed memberships) for historical data
    const employeeIds = memberships.map((m) => m.employeeId);

    // Get employee details for calculating historical membership
    const employees = await Promise.all(
      employeeIds.map(id => ctx.db.get(id))
    );

    // Create a map of employeeId to employee for quick lookup
    const employeeMap = new Map(
      employees.filter(e => e !== null).map(e => [e!._id, e!])
    );

    const days = args.days || 7;
    const trends = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      // Calculate timestamps for this day
      const dayStartTimestamp = new Date(dateStr).getTime();
      // Emails are sent at 1pm UTC (3pm SAST) — only count employees active at send time
      const emailSendTimestamp = dayStartTimestamp + 13 * 60 * 60 * 1000;

      // Calculate group member count on this day (should match how many got emails)
      // Count memberships where employee was active at email send time
      const memberCountOnDay = memberships.filter(m => {
        const employee = employeeMap.get(m.employeeId);
        if (!employee) return false;

        // If membership has createdAt, use it; otherwise fall back to employee's createdAt
        const effectiveCreatedAt = m.createdAt || employee.createdAt;
        const wasCreated = effectiveCreatedAt < emailSendTimestamp;

        // Check if employee was not deleted or was deleted on/after the email send time
        const wasNotDeleted = !employee.deletedAt || employee.deletedAt >= emailSendTimestamp;

        // Check if membership was not removed or was removed on/after the email send time
        const wasNotRemoved = !m.removedAt || m.removedAt >= emailSendTimestamp;

        return wasCreated && wasNotDeleted && wasNotRemoved;
      }).length;

      const checkins = await ctx.db
        .query("moodCheckins")
        .withIndex("by_organisation_and_date", (q) =>
          q.eq("organisation", organisation).eq("date", dateStr)
        )
        .collect();

      // Filter to only include employees in this group (who were members on that day)
      const groupCheckinsOnDay = checkins.filter((c) => {
        if (!employeeIds.includes(c.employeeId)) return false;

        const employee = employeeMap.get(c.employeeId);
        if (!employee) return false;

        // Check if this employee was a member on this day
        const membership = memberships.find(m => m.employeeId === c.employeeId);
        if (!membership) return false;

        // If membership has createdAt, use it; otherwise fall back to employee's createdAt
        const effectiveCreatedAt = membership.createdAt || employee.createdAt;
        const wasCreated = effectiveCreatedAt < emailSendTimestamp;

        // Check if employee was not deleted or was deleted on/after the email send time
        const wasNotDeleted = !employee.deletedAt || employee.deletedAt >= emailSendTimestamp;

        // Check if membership was not removed or was removed on/after the email send time
        const wasNotRemoved = !membership.removedAt || membership.removedAt >= emailSendTimestamp;

        return wasCreated && wasNotDeleted && wasNotRemoved;
      });

      const green = groupCheckinsOnDay.filter((c) => c.mood === "green").length;
      const amber = groupCheckinsOnDay.filter((c) => c.mood === "amber").length;
      const red = groupCheckinsOnDay.filter((c) => c.mood === "red").length;
      const total = groupCheckinsOnDay.length;

      trends.push({
        date: dateStr,
        green,
        amber,
        red,
        total,
        employeeCount: memberCountOnDay,
        greenPercent: total > 0 ? Math.round((green / total) * 100) : 0,
        amberPercent: total > 0 ? Math.round((amber / total) * 100) : 0,
        redPercent: total > 0 ? Math.round((red / total) * 100) : 0,
      });
    }

    return trends;
  },
});

// Personalized check-in messages with encouraging words and Bible verses
const CHECKIN_MESSAGES: Array<{
  greeting: string;
  subtext: string;
  subject: string;
  verse: string;
  verseRef: string;
}> = [
  {
    greeting: "Hey {name}, how are you really doing today?",
    subtext: "Take a moment to check in with yourself. Your wellbeing matters.",
    subject: "A moment for you: How are you feeling?",
    verse: "The Lord is close to the brokenhearted and saves those who are crushed in spirit.",
    verseRef: "Psalm 34:18"
  },
  {
    greeting: "Good afternoon, {name}! How's your day going?",
    subtext: "We genuinely care about how you're doing. Let us know.",
    subject: "Checking in: How's your day?",
    verse: "I can do all things through Christ who strengthens me.",
    verseRef: "Philippians 4:13"
  },
  {
    greeting: "{name}, just checking in on you 💙",
    subtext: "Your mental health is important. How are things going?",
    subject: "We're thinking of you",
    verse: "See what great love the Father has lavished on us, that we should be called children of God!",
    verseRef: "1 John 3:1"
  },
  {
    greeting: "Hi {name}, how are you feeling right now?",
    subtext: "This is your space to be honest about where you're at today.",
    subject: "Daily check-in: How are you?",
    verse: "Cast all your anxiety on him because he cares for you.",
    verseRef: "1 Peter 5:7"
  },
  {
    greeting: "Hey {name}, we wanted to see how you're doing",
    subtext: "Taking a moment to pause and reflect can make a difference.",
    subject: "How are you today?",
    verse: "Peace I leave with you; my peace I give you. Do not let your hearts be troubled and do not be afraid.",
    verseRef: "John 14:27"
  },
  {
    greeting: "{name}, how's everything going for you today?",
    subtext: "Your team wants to make sure you're doing okay.",
    subject: "Touching base: How are things?",
    verse: "Carry each other's burdens, and in this way you will fulfill the law of Christ.",
    verseRef: "Galatians 6:2"
  },
  {
    greeting: "Hi there {name}! How are you holding up?",
    subtext: "Whether it's a great day or a tough one, we're here for you.",
    subject: "Checking in on you",
    verse: "Weeping may stay for the night, but rejoicing comes in the morning.",
    verseRef: "Psalm 30:5"
  },
  {
    greeting: "{name}, taking a moment to check in with you",
    subtext: "Your feelings are valid. Let us know how you're doing.",
    subject: "A quick check-in",
    verse: "For we are God's handiwork, created in Christ Jesus to do good works.",
    verseRef: "Ephesians 2:10"
  },
  {
    greeting: "Hey {name}, how's life treating you today?",
    subtext: "We hope you're doing well. Let us know either way.",
    subject: "How's your day going?",
    verse: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.",
    verseRef: "Jeremiah 29:11"
  },
  {
    greeting: "{name}, just wanted to ask – how are you?",
    subtext: "Sometimes it helps to pause and reflect. We're listening.",
    subject: "R u OK today?",
    verse: "Therefore do not worry about tomorrow, for tomorrow will worry about itself.",
    verseRef: "Matthew 6:34"
  },
  {
    greeting: "Good afternoon {name}! How are you feeling?",
    subtext: "Your wellbeing is a priority. Take a moment to check in.",
    subject: "Afternoon check-in",
    verse: "Come to me, all you who are weary and burdened, and I will give you rest.",
    verseRef: "Matthew 11:28"
  },
  {
    greeting: "Hi {name}, hope you're having a good day!",
    subtext: "Let us know how you're really doing today.",
    subject: "How are you doing?",
    verse: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles.",
    verseRef: "Isaiah 40:31"
  },
  {
    greeting: "{name}, we care about how you're doing",
    subtext: "Your mental health matters to us. How are things?",
    subject: "We care: How are you?",
    verse: "The Lord your God is with you, the Mighty Warrior who saves. He will take great delight in you.",
    verseRef: "Zephaniah 3:17"
  },
  {
    greeting: "Hey {name}, how's your energy today?",
    subtext: "Whether you're thriving or surviving, we want to know.",
    subject: "Energy check: How are you?",
    verse: "My grace is sufficient for you, for my power is made perfect in weakness.",
    verseRef: "2 Corinthians 12:9"
  },
  {
    greeting: "{name}, time for your daily wellbeing check",
    subtext: "A quick moment to reflect on how you're feeling.",
    subject: "Your daily wellbeing check",
    verse: "This is the day that the Lord has made; let us rejoice and be glad in it.",
    verseRef: "Psalm 118:24"
  },
  {
    greeting: "{name}, we're thinking of you today",
    subtext: "How are you feeling? We're here to listen.",
    subject: "You're on our minds",
    verse: "You have searched me, Lord, and you know me. You know when I sit and when I rise.",
    verseRef: "Psalm 139:1-2"
  },
  {
    greeting: "Hi {name}, just reaching out to check on you",
    subtext: "Your wellbeing is important to us.",
    subject: "Reaching out to you",
    verse: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.",
    verseRef: "Joshua 1:9"
  },
  {
    greeting: "{name}, how is your heart today?",
    subtext: "Sometimes we need to pause and check in with ourselves.",
    subject: "A heart check-in",
    verse: "Above all else, guard your heart, for everything you do flows from it.",
    verseRef: "Proverbs 4:23"
  },
  {
    greeting: "Hey {name}, sending you good thoughts today",
    subtext: "We hope today is treating you well.",
    subject: "Sending you good thoughts",
    verse: "And surely I am with you always, to the very end of the age.",
    verseRef: "Matthew 28:20"
  },
  {
    greeting: "{name}, checking in – how are things?",
    subtext: "We value you and want to know how you're doing.",
    subject: "Quick check-in",
    verse: "Consider it pure joy, my brothers and sisters, whenever you face trials of many kinds, because you know that the testing of your faith produces perseverance.",
    verseRef: "James 1:2-3"
  },
  {
    greeting: "Good day {name}! How's everything with you?",
    subtext: "Take a moment to reflect on how you're feeling.",
    subject: "How's everything?",
    verse: "He has made everything beautiful in its time.",
    verseRef: "Ecclesiastes 3:11"
  }
];

// Extra encouraging messages for employees who responded "red" yesterday
const FOLLOWUP_ENCOURAGEMENT_MESSAGES: Array<{
  greeting: string;
  subtext: string;
  subject: string;
  verse: string;
  verseRef: string;
}> = [
  {
    greeting: "{name}, we've been thinking about you 💙",
    subtext: "Yesterday was tough, and we wanted to check in on how you're doing today.",
    subject: "We're here for you",
    verse: "The Lord is my light and my salvation—whom shall I fear? The Lord is the stronghold of my life—of whom shall I be afraid?",
    verseRef: "Psalm 27:1"
  },
  {
    greeting: "Hi {name}, hoping today is a little brighter",
    subtext: "We noticed yesterday was difficult. How are you feeling now?",
    subject: "Hoping you're doing better",
    verse: "Because of the Lord's great love we are not consumed, for his compassions never fail. They are new every morning.",
    verseRef: "Lamentations 3:22-23"
  },
  {
    greeting: "{name}, just wanted you to know you're not alone",
    subtext: "We care about how you're doing, especially after a challenging day.",
    subject: "You're not alone",
    verse: "Two are better than one... If either of them falls down, one can help the other up.",
    verseRef: "Ecclesiastes 4:9-10"
  },
  {
    greeting: "Hey {name}, checking in with extra care today",
    subtext: "We know yesterday was hard. How are you holding up?",
    subject: "Checking in with care",
    verse: "Even though I walk through the darkest valley, I will fear no evil, for you are with me.",
    verseRef: "Psalm 23:4"
  },
  {
    greeting: "{name}, sending you strength today",
    subtext: "After a tough day, we wanted to make sure you're okay.",
    subject: "Sending you strength",
    verse: "Are not five sparrows sold for two pennies? Yet not one of them is forgotten by God... you are worth more than many sparrows.",
    verseRef: "Luke 12:6-7"
  },
  {
    greeting: "Hi {name}, we hope today feels a bit lighter",
    subtext: "Yesterday was rough, and we're here to support you.",
    subject: "Here to support you",
    verse: "He heals the brokenhearted and binds up their wounds.",
    verseRef: "Psalm 147:3"
  },
  {
    greeting: "{name}, your wellbeing matters deeply to us",
    subtext: "We're following up because we genuinely care about you.",
    subject: "Your wellbeing matters",
    verse: "God is our refuge and strength, an ever-present help in trouble.",
    verseRef: "Psalm 46:1"
  }
];

// 365 daily Bible verses — one for each day of the year
// Drawn from Psalms, Proverbs, Jesus's teachings, and encouraging Scripture throughout the Bible
const DAILY_VERSES: Array<{ verse: string; verseRef: string }> = [
  // Psalms
  { verse: "The Lord is my shepherd; I shall not want.", verseRef: "Psalm 23:1" },
  { verse: "Wait for the Lord; be strong, and let your heart take courage; wait for the Lord!", verseRef: "Psalm 27:14" },
  { verse: "The Lord is my strength and my shield; my heart trusts in him, and he helps me.", verseRef: "Psalm 28:7" },
  { verse: "The Lord gives strength to his people; the Lord blesses his people with peace.", verseRef: "Psalm 29:11" },
  { verse: "Be strong and take heart, all you who hope in the Lord.", verseRef: "Psalm 31:24" },
  { verse: "You are my hiding place; you will protect me from trouble and surround me with songs of deliverance.", verseRef: "Psalm 32:7" },
  { verse: "I sought the Lord, and he answered me; he delivered me from all my fears.", verseRef: "Psalm 34:4" },
  { verse: "Taste and see that the Lord is good; blessed is the one who takes refuge in him.", verseRef: "Psalm 34:8" },
  { verse: "Take delight in the Lord, and he will give you the desires of your heart.", verseRef: "Psalm 37:4" },
  { verse: "Commit your way to the Lord; trust in him and he will do this.", verseRef: "Psalm 37:5" },
  { verse: "The Lord makes firm the steps of the one who delights in him; though he may stumble, he will not fall, for the Lord upholds him with his hand.", verseRef: "Psalm 37:23-24" },
  { verse: "Why, my soul, are you downcast? Why so disturbed within me? Put your hope in God, for I will yet praise him.", verseRef: "Psalm 42:5" },
  { verse: "Be still, and know that I am God.", verseRef: "Psalm 46:10" },
  { verse: "Cast your cares on the Lord and he will sustain you; he will never let the righteous be shaken.", verseRef: "Psalm 55:22" },
  { verse: "When I am afraid, I put my trust in you.", verseRef: "Psalm 56:3" },
  { verse: "Truly my soul finds rest in God; my salvation comes from him. Truly he is my rock and my salvation.", verseRef: "Psalm 62:1-2" },
  { verse: "My flesh and my heart may fail, but God is the strength of my heart and my portion forever.", verseRef: "Psalm 73:26" },
  { verse: "You, Lord, are forgiving and good, abounding in love to all who call to you.", verseRef: "Psalm 86:5" },
  { verse: "Whoever dwells in the shelter of the Most High will rest in the shadow of the Almighty.", verseRef: "Psalm 91:1-2" },
  { verse: "He will cover you with his feathers, and under his wings you will find refuge; his faithfulness will be your shield.", verseRef: "Psalm 91:4" },
  { verse: "When anxiety was great within me, your consolation brought me joy.", verseRef: "Psalm 94:19" },
  { verse: "For the Lord is good and his love endures forever; his faithfulness continues through all generations.", verseRef: "Psalm 100:5" },
  { verse: "As far as the east is from the west, so far has he removed our transgressions from us.", verseRef: "Psalm 103:12" },
  { verse: "For he satisfies the thirsty and fills the hungry with good things.", verseRef: "Psalm 107:9" },
  { verse: "Your word is a lamp for my feet, a light on my path.", verseRef: "Psalm 119:105" },
  { verse: "You are my refuge and my shield; I have put my hope in your word.", verseRef: "Psalm 119:114" },
  { verse: "I lift up my eyes to the mountains — where does my help come from? My help comes from the Lord, the Maker of heaven and earth.", verseRef: "Psalm 121:1-2" },
  { verse: "The Lord will watch over your coming and going both now and forevermore.", verseRef: "Psalm 121:8" },
  { verse: "Those who sow with tears will reap with songs of joy.", verseRef: "Psalm 126:5" },
  { verse: "For you created my inmost being; you knit me together in my mother's womb. I praise you because I am fearfully and wonderfully made.", verseRef: "Psalm 139:13-14" },
  { verse: "Let the morning bring me word of your unfailing love, for I have put my trust in you.", verseRef: "Psalm 143:8" },
  { verse: "The Lord is near to all who call on him, to all who call on him in truth.", verseRef: "Psalm 145:18" },
  { verse: "For the Lord takes delight in his people; he crowns the humble with victory.", verseRef: "Psalm 149:4" },
  { verse: "I keep my eyes always on the Lord. With him at my right hand, I will not be shaken.", verseRef: "Psalm 16:8" },
  { verse: "The Lord is my rock, my fortress and my deliverer; my God is my rock, in whom I take refuge, my shield and the horn of my salvation.", verseRef: "Psalm 18:2" },
  { verse: "May these words of my mouth and this meditation of my heart be pleasing in your sight, Lord, my Rock and my Redeemer.", verseRef: "Psalm 19:14" },
  { verse: "The Lord is my light and my salvation — whom shall I fear? The Lord is the stronghold of my life — of whom shall I be afraid?", verseRef: "Psalm 27:1" },
  { verse: "The angel of the Lord encamps around those who fear him, and he delivers them.", verseRef: "Psalm 34:7" },
  { verse: "Your love, Lord, reaches to the heavens, your faithfulness to the skies.", verseRef: "Psalm 36:5" },
  { verse: "How priceless is your unfailing love, O God! People take refuge in the shadow of your wings.", verseRef: "Psalm 36:7" },
  { verse: "Be still before the Lord and wait patiently for him.", verseRef: "Psalm 37:7" },
  { verse: "He put a new song in my mouth, a hymn of praise to our God.", verseRef: "Psalm 40:3" },
  { verse: "God is within her, she will not fall; God will help her at break of day.", verseRef: "Psalm 46:5" },
  { verse: "For this God is our God for ever and ever; he will be our guide even to the end.", verseRef: "Psalm 48:14" },
  { verse: "And call on me in the day of trouble; I will deliver you, and you will honor me.", verseRef: "Psalm 50:15" },
  { verse: "Because your love is better than life, my lips will glorify you.", verseRef: "Psalm 63:3" },
  { verse: "You make known to me the path of life; you will fill me with joy in your presence.", verseRef: "Psalm 16:11" },
  { verse: "Keep me as the apple of your eye; hide me in the shadow of your wings.", verseRef: "Psalm 17:8" },
  { verse: "May he give you the desire of your heart and make all your plans succeed.", verseRef: "Psalm 20:4" },
  { verse: "You prepare a table before me in the presence of my enemies. Surely your goodness and love will follow me all the days of my life.", verseRef: "Psalm 23:5-6" },
  { verse: "Show me your ways, Lord, teach me your paths. Guide me in your truth and teach me.", verseRef: "Psalm 25:4-5" },
  { verse: "He guides the humble in what is right and teaches them his way.", verseRef: "Psalm 25:9" },
  { verse: "We wait in hope for the Lord; he is our help and our shield. In him our hearts rejoice.", verseRef: "Psalm 33:20-21" },
  { verse: "The salvation of the righteous comes from the Lord; he is their stronghold in time of trouble.", verseRef: "Psalm 37:39" },
  { verse: "Why, my soul, are you downcast? Put your hope in God, for I will yet praise him, my Savior and my God.", verseRef: "Psalm 43:5" },
  { verse: "Praise be to the Lord, to God our Savior, who daily bears our burdens.", verseRef: "Psalm 68:19" },
  { verse: "Though you have made me see troubles, many and bitter, you will restore my life again; you will increase my honor and comfort me once more.", verseRef: "Psalm 71:20-21" },
  { verse: "You are the God who performs miracles; you display your power among the peoples.", verseRef: "Psalm 77:14" },
  { verse: "The Lord God is a sun and shield; the Lord bestows favor and honor; no good thing does he withhold from those whose walk is blameless.", verseRef: "Psalm 84:11" },
  { verse: "When I am in distress, I call to you, because you answer me.", verseRef: "Psalm 86:7" },
  { verse: "Satisfy us in the morning with your unfailing love, that we may sing for joy and be glad all our days.", verseRef: "Psalm 90:14" },
  { verse: "Because he loves me, says the Lord, I will rescue him; I will protect him, for he acknowledges my name. He will call on me, and I will answer him.", verseRef: "Psalm 91:14-15" },
  { verse: "The righteous will flourish like a palm tree, they will grow like a cedar of Lebanon.", verseRef: "Psalm 92:12" },
  { verse: "For the Lord will not reject his people; he will never forsake his inheritance.", verseRef: "Psalm 94:14" },
  { verse: "As a father has compassion on his children, so the Lord has compassion on those who fear him.", verseRef: "Psalm 103:13" },
  { verse: "Give thanks to the Lord, for he is good; his love endures forever.", verseRef: "Psalm 107:1" },
  { verse: "Return to your rest, my soul, for the Lord has been good to you.", verseRef: "Psalm 116:7" },
  { verse: "I have hidden your word in my heart that I might not sin against you.", verseRef: "Psalm 119:11" },
  { verse: "My comfort in my suffering is this: your promise preserves my life.", verseRef: "Psalm 119:50" },
  { verse: "May your unfailing love be my comfort, according to your promise to your servant.", verseRef: "Psalm 119:76" },
  { verse: "Great peace have those who love your law, and nothing can make them stumble.", verseRef: "Psalm 119:165" },
  { verse: "The unfolding of your words gives light; it gives understanding to the simple.", verseRef: "Psalm 119:130" },
  { verse: "I wait for the Lord, my whole being waits, and in his word I put my hope.", verseRef: "Psalm 130:5" },
  { verse: "But I have calmed and quieted myself; I am like a weaned child with its mother; like a weaned child I am content.", verseRef: "Psalm 131:2" },
  { verse: "I will declare that your love stands firm forever, that you have established your faithfulness in heaven itself.", verseRef: "Psalm 89:2" },
  { verse: "From the ends of the earth I call to you, I call as my heart grows faint; lead me to the rock that is higher than I.", verseRef: "Psalm 61:2-3" },
  { verse: "Yes, my soul, find rest in God; my hope comes from him. Truly he is my rock and my salvation.", verseRef: "Psalm 62:5-6" },
  { verse: "Those who trust in the Lord are like Mount Zion, which cannot be shaken but endures forever.", verseRef: "Psalm 125:1" },
  { verse: "The Lord has done great things for us, and we are filled with joy.", verseRef: "Psalm 126:3" },
  { verse: "I will praise you, Lord my God, with all my heart; I will glorify your name forever.", verseRef: "Psalm 86:12" },
  { verse: "Even in darkness light dawns for the upright, for those who are gracious and compassionate and righteous.", verseRef: "Psalm 112:4" },
  { verse: "Some trust in chariots and some in horses, but we trust in the name of the Lord our God.", verseRef: "Psalm 20:7" },
  { verse: "He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.", verseRef: "Psalm 23:2-3" },
  { verse: "Fear the Lord, you his holy people, for those who fear him lack nothing.", verseRef: "Psalm 34:9" },
  { verse: "The meek will inherit the land and enjoy peace and prosperity.", verseRef: "Psalm 37:11" },
  { verse: "Blessed are those who have regard for the weak; the Lord delivers them in times of trouble.", verseRef: "Psalm 41:1" },
  { verse: "I cry out to God Most High, to God, who vindicates me.", verseRef: "Psalm 57:2" },
  { verse: "Look to the Lord and his strength; seek his face always.", verseRef: "Psalm 105:4" },
  { verse: "The Lord watches over you — the Lord is your shade at your right hand.", verseRef: "Psalm 121:5" },
  { verse: "This is the day that the Lord has made; we will rejoice and be glad in it.", verseRef: "Psalm 118:24" },
  { verse: "Weeping may stay for the night, but rejoicing comes in the morning.", verseRef: "Psalm 30:5" },
  { verse: "For we are God's handiwork, created in Christ Jesus to do good works, which God prepared in advance for us to do.", verseRef: "Ephesians 2:10" },
  // Proverbs
  { verse: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.", verseRef: "Proverbs 3:5-6" },
  { verse: "When you lie down, you will not be afraid; when you lie down, your sleep will be sweet.", verseRef: "Proverbs 3:24" },
  { verse: "The path of the righteous is like the morning sun, shining ever brighter till the full light of day.", verseRef: "Proverbs 4:18" },
  { verse: "Anxiety weighs down the heart, but a kind word cheers it up.", verseRef: "Proverbs 12:25" },
  { verse: "Hope deferred makes the heart sick, but a longing fulfilled is a tree of life.", verseRef: "Proverbs 13:12" },
  { verse: "A heart at peace gives life to the body.", verseRef: "Proverbs 14:30" },
  { verse: "A gentle answer turns away wrath, but a harsh word stirs up anger.", verseRef: "Proverbs 15:1" },
  { verse: "A happy heart makes the face cheerful, but heartache crushes the spirit.", verseRef: "Proverbs 15:13" },
  { verse: "Light in a messenger's eyes brings joy to the heart, and good news gives health to the bones.", verseRef: "Proverbs 15:30" },
  { verse: "Commit to the Lord whatever you do, and he will establish your plans.", verseRef: "Proverbs 16:3" },
  { verse: "In their hearts humans plan their course, but the Lord establishes their steps.", verseRef: "Proverbs 16:9" },
  { verse: "A friend loves at all times, and a brother is born for a time of adversity.", verseRef: "Proverbs 17:17" },
  { verse: "A cheerful heart is good medicine, but a crushed spirit dries up the bones.", verseRef: "Proverbs 17:22" },
  { verse: "The name of the Lord is a fortified tower; the righteous run to it and are safe.", verseRef: "Proverbs 18:10" },
  { verse: "There is a friend who sticks closer than a brother.", verseRef: "Proverbs 18:24" },
  { verse: "Many are the plans in a person's heart, but it is the Lord's purpose that prevails.", verseRef: "Proverbs 19:21" },
  { verse: "There is surely a future hope for you, and your hope will not be cut off.", verseRef: "Proverbs 23:18" },
  { verse: "For though the righteous fall seven times, they rise again.", verseRef: "Proverbs 24:16" },
  { verse: "As iron sharpens iron, so one person sharpens another.", verseRef: "Proverbs 27:17" },
  { verse: "A faithful person will be richly blessed.", verseRef: "Proverbs 28:20" },
  { verse: "Whoever trusts in the Lord is kept safe.", verseRef: "Proverbs 29:25" },
  { verse: "She is clothed with strength and dignity; she can laugh at the days to come.", verseRef: "Proverbs 31:25" },
  { verse: "A generous person will prosper; whoever refreshes others will be refreshed.", verseRef: "Proverbs 11:25" },
  { verse: "For the Lord gives wisdom; from his mouth come knowledge and understanding.", verseRef: "Proverbs 2:6" },
  { verse: "Her ways are pleasant ways, and all her paths are peace.", verseRef: "Proverbs 3:17" },
  { verse: "I love those who love me, and those who seek me find me.", verseRef: "Proverbs 8:17" },
  { verse: "The words of the reckless pierce like swords, but the tongue of the wise brings healing.", verseRef: "Proverbs 12:18" },
  { verse: "Whoever fears the Lord has a secure fortress, and for their children it will be a refuge.", verseRef: "Proverbs 14:26" },
  { verse: "Whoever pursues righteousness and love finds life, prosperity and honor.", verseRef: "Proverbs 21:21" },
  { verse: "A good name is more desirable than great riches; to be esteemed is better than silver or gold.", verseRef: "Proverbs 22:1" },
  // Jesus's words — Gospels
  { verse: "Blessed are the poor in spirit, for theirs is the kingdom of heaven.", verseRef: "Matthew 5:3" },
  { verse: "Blessed are those who mourn, for they will be comforted.", verseRef: "Matthew 5:4" },
  { verse: "Blessed are the meek, for they will inherit the earth.", verseRef: "Matthew 5:5" },
  { verse: "Blessed are those who hunger and thirst for righteousness, for they will be filled.", verseRef: "Matthew 5:6" },
  { verse: "Blessed are the merciful, for they will be shown mercy.", verseRef: "Matthew 5:7" },
  { verse: "Blessed are the pure in heart, for they will see God.", verseRef: "Matthew 5:8" },
  { verse: "Blessed are the peacemakers, for they will be called children of God.", verseRef: "Matthew 5:9" },
  { verse: "You are the light of the world. Let your light shine before others, that they may see your good deeds and glorify your Father in heaven.", verseRef: "Matthew 5:14-16" },
  { verse: "Look at the birds of the air; they do not sow or reap or store away in barns, and yet your heavenly Father feeds them. Are you not much more valuable than they?", verseRef: "Matthew 6:26" },
  { verse: "But seek first his kingdom and his righteousness, and all these things will be given to you as well.", verseRef: "Matthew 6:33" },
  { verse: "Ask and it will be given to you; seek and you will find; knock and the door will be opened to you.", verseRef: "Matthew 7:7" },
  { verse: "So in everything, do to others what you would have them do to you.", verseRef: "Matthew 7:12" },
  { verse: "Take my yoke upon you and learn from me, for I am gentle and humble in heart, and you will find rest for your souls. For my yoke is easy and my burden is light.", verseRef: "Matthew 11:29-30" },
  { verse: "For where two or three gather in my name, there am I with them.", verseRef: "Matthew 18:20" },
  { verse: "With man this is impossible, but with God all things are possible.", verseRef: "Matthew 19:26" },
  { verse: "Love the Lord your God with all your heart and with all your soul and with all your mind... Love your neighbour as yourself.", verseRef: "Matthew 22:37-39" },
  { verse: "The Spirit of the Lord is on me, because he has anointed me to proclaim good news to the poor, to set the oppressed free.", verseRef: "Luke 4:18" },
  { verse: "Indeed, the very hairs of your head are all numbered. Don't be afraid; you are worth more than many sparrows.", verseRef: "Luke 12:7" },
  { verse: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.", verseRef: "John 3:16" },
  { verse: "I am the light of the world. Whoever follows me will never walk in darkness, but will have the light of life.", verseRef: "John 8:12" },
  { verse: "If you hold to my teaching, you are really my disciples. Then you will know the truth, and the truth will set you free.", verseRef: "John 8:31-32" },
  { verse: "I have come that they may have life, and have it to the full.", verseRef: "John 10:10" },
  { verse: "My sheep listen to my voice; I know them, and they follow me. I give them eternal life, and they shall never perish.", verseRef: "John 10:27-28" },
  { verse: "A new command I give you: Love one another. As I have loved you, so you must love one another.", verseRef: "John 13:34" },
  { verse: "Do not let your hearts be troubled. You believe in God; believe also in me. My Father's house has many rooms.", verseRef: "John 14:1-2" },
  { verse: "I am the way and the truth and the life.", verseRef: "John 14:6" },
  { verse: "I am the vine; you are the branches. If you remain in me and I in you, you will bear much fruit.", verseRef: "John 15:5" },
  { verse: "As the Father has loved me, so have I loved you. Now remain in my love.", verseRef: "John 15:9" },
  { verse: "I have told you this so that my joy may be in you and that your joy may be complete.", verseRef: "John 15:11" },
  { verse: "Greater love has no one than this: to lay down one's life for one's friends.", verseRef: "John 15:13" },
  { verse: "I have told you these things, so that in me you may have peace. In this world you will have trouble. But take heart! I have overcome the world.", verseRef: "John 16:33" },
  // Isaiah
  { verse: "You will keep in perfect peace those whose minds are steadfast, because they trust in you.", verseRef: "Isaiah 26:3" },
  { verse: "In repentance and rest is your salvation, in quietness and trust is your strength.", verseRef: "Isaiah 30:15" },
  { verse: "Whether you turn to the right or to the left, your ears will hear a voice behind you, saying, 'This is the way; walk in it.'", verseRef: "Isaiah 30:21" },
  { verse: "He gives strength to the weary and increases the power of the weak.", verseRef: "Isaiah 40:29" },
  { verse: "So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you.", verseRef: "Isaiah 41:10" },
  { verse: "For I am the Lord your God who takes hold of your right hand and says to you, Do not fear; I will help you.", verseRef: "Isaiah 41:13" },
  { verse: "Do not fear, for I have redeemed you; I have summoned you by name; you are mine.", verseRef: "Isaiah 43:1" },
  { verse: "When you pass through the waters, I will be with you; and when you pass through the rivers, they will not sweep over you.", verseRef: "Isaiah 43:2" },
  { verse: "Forget the former things; do not dwell on the past. See, I am doing a new thing! Now it springs up; do you not perceive it?", verseRef: "Isaiah 43:18-19" },
  { verse: "I have engraved you on the palms of my hands.", verseRef: "Isaiah 49:16" },
  { verse: "By his wounds we are healed.", verseRef: "Isaiah 53:5" },
  { verse: "Though the mountains be shaken and the hills be removed, yet my unfailing love for you will not be shaken.", verseRef: "Isaiah 54:10" },
  { verse: "The Lord will guide you always; he will satisfy your needs in a sun-scorched land and will strengthen your frame.", verseRef: "Isaiah 58:11" },
  { verse: "Arise, shine, for your light has come, and the glory of the Lord rises upon you.", verseRef: "Isaiah 60:1" },
  { verse: "He has sent me to provide for those who grieve — to bestow on them a crown of beauty instead of ashes, the oil of joy instead of mourning.", verseRef: "Isaiah 61:3" },
  { verse: "I have loved you with an everlasting love; I have drawn you with unfailing kindness.", verseRef: "Jeremiah 31:3" },
  { verse: "I will turn their mourning into gladness; I will give them comfort and joy instead of sorrow.", verseRef: "Jeremiah 31:13" },
  { verse: "Blessed is the one who trusts in the Lord, whose confidence is in him. They will be like a tree planted by the water.", verseRef: "Jeremiah 17:7-8" },
  { verse: "The Lord is good to those whose hope is in him, to the one who seeks him.", verseRef: "Lamentations 3:25" },
  { verse: "I will give you a new heart and put a new spirit in you.", verseRef: "Ezekiel 36:26" },
  { verse: "Do not gloat over me, my enemy! Though I have fallen, I will rise. Though I sit in darkness, the Lord will be my light.", verseRef: "Micah 7:8" },
  { verse: "Though the fig tree does not bud and there are no grapes on the vines, yet I will rejoice in the Lord, I will be joyful in God my Savior.", verseRef: "Habakkuk 3:17-18" },
  { verse: "Not by might nor by power, but by my Spirit, says the Lord Almighty.", verseRef: "Zechariah 4:6" },
  // Other Old Testament
  { verse: "I am with you and will watch over you wherever you go.", verseRef: "Genesis 28:15" },
  { verse: "Be strong and courageous. Do not be afraid or terrified because of them, for the Lord your God goes with you.", verseRef: "Deuteronomy 31:6" },
  { verse: "The eternal God is your refuge, and underneath are the everlasting arms.", verseRef: "Deuteronomy 33:27" },
  { verse: "The Lord does not look at the things people look at. People look at the outward appearance, but the Lord looks at the heart.", verseRef: "1 Samuel 16:7" },
  { verse: "Do not grieve, for the joy of the Lord is your strength.", verseRef: "Nehemiah 8:10" },
  { verse: "I know that my redeemer lives, and that in the end he will stand on the earth.", verseRef: "Job 19:25" },
  { verse: "The Lord bless you and keep you; the Lord make his face shine on you and be gracious to you; the Lord turn his face toward you and give you peace.", verseRef: "Numbers 6:24-26" },
  { verse: "Know therefore that the Lord your God is God; he is the faithful God, keeping his covenant of love to a thousand generations.", verseRef: "Deuteronomy 7:9" },
  { verse: "I will repay you for the years the locusts have eaten.", verseRef: "Joel 2:25" },
  { verse: "Many waters cannot quench love; rivers cannot sweep it away.", verseRef: "Song of Solomon 8:7" },
  // Romans
  { verse: "We also glory in our sufferings, because we know that suffering produces perseverance; perseverance, character; and character, hope. And hope does not put us to shame.", verseRef: "Romans 5:3-5" },
  { verse: "Therefore, there is now no condemnation for those who are in Christ Jesus.", verseRef: "Romans 8:1" },
  { verse: "I consider that our present sufferings are not worth comparing with the glory that will be revealed in us.", verseRef: "Romans 8:18" },
  { verse: "The Spirit helps us in our weakness. We do not know what we ought to pray for, but the Spirit himself intercedes for us.", verseRef: "Romans 8:26" },
  { verse: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose.", verseRef: "Romans 8:28" },
  { verse: "If God is for us, who can be against us?", verseRef: "Romans 8:31" },
  { verse: "In all these things we are more than conquerors through him who loved us.", verseRef: "Romans 8:37" },
  { verse: "For I am convinced that neither death nor life, neither angels nor demons, neither the present nor the future, nor any powers, neither height nor depth, nor anything else in all creation, will be able to separate us from the love of God.", verseRef: "Romans 8:38-39" },
  { verse: "Do not conform to the pattern of this world, but be transformed by the renewing of your mind.", verseRef: "Romans 12:2" },
  { verse: "Be devoted to one another in love. Honor one another above yourselves.", verseRef: "Romans 12:10" },
  { verse: "Be joyful in hope, patient in affliction, faithful in prayer.", verseRef: "Romans 12:12" },
  { verse: "Do not be overcome by evil, but overcome evil with good.", verseRef: "Romans 12:21" },
  { verse: "May the God of hope fill you with all joy and peace as you trust in him, so that you may overflow with hope by the power of the Holy Spirit.", verseRef: "Romans 15:13" },
  // Philippians
  { verse: "Being confident of this, that he who began a good work in you will carry it on to completion until the day of Christ Jesus.", verseRef: "Philippians 1:6" },
  { verse: "For it is God who works in you to will and to act in order to fulfill his good purpose.", verseRef: "Philippians 2:13" },
  { verse: "I press on toward the goal to win the prize for which God has called me heavenward in Christ Jesus.", verseRef: "Philippians 3:14" },
  { verse: "Rejoice in the Lord always. I will say it again: Rejoice!", verseRef: "Philippians 4:4" },
  { verse: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and minds.", verseRef: "Philippians 4:6-7" },
  { verse: "Whatever is true, whatever is noble, whatever is right, whatever is pure, whatever is lovely, whatever is admirable — think about such things.", verseRef: "Philippians 4:8" },
  { verse: "I have learned, in whatever state I am, to be content.", verseRef: "Philippians 4:11" },
  { verse: "And my God will meet all your needs according to the riches of his glory in Christ Jesus.", verseRef: "Philippians 4:19" },
  // Corinthians
  { verse: "God is faithful; he will not let you be tempted beyond what you can bear. But when you are tempted, he will also provide a way out so that you can endure it.", verseRef: "1 Corinthians 10:13" },
  { verse: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud. It does not dishonor others, it is not self-seeking.", verseRef: "1 Corinthians 13:4-5" },
  { verse: "Love bears all things, believes all things, hopes all things, endures all things.", verseRef: "1 Corinthians 13:7" },
  { verse: "And now these three remain: faith, hope and love. But the greatest of these is love.", verseRef: "1 Corinthians 13:13" },
  { verse: "Be on your guard; stand firm in the faith; be courageous; be strong. Do everything in love.", verseRef: "1 Corinthians 16:13-14" },
  { verse: "Praise be to the God and Father of our Lord Jesus Christ, the Father of compassion and the God of all comfort, who comforts us in all our troubles.", verseRef: "2 Corinthians 1:3-4" },
  { verse: "We are hard pressed on every side, but not crushed; perplexed, but not in despair; persecuted, but not abandoned; struck down, but not destroyed.", verseRef: "2 Corinthians 4:8-9" },
  { verse: "For our light and momentary troubles are achieving for us an eternal glory that far outweighs them all.", verseRef: "2 Corinthians 4:17" },
  { verse: "Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!", verseRef: "2 Corinthians 5:17" },
  { verse: "And God is able to bless you abundantly, so that in all things at all times, having all that you need, you will abound in every good work.", verseRef: "2 Corinthians 9:8" },
  { verse: "For when I am weak, then I am strong.", verseRef: "2 Corinthians 12:10" },
  // Galatians, Ephesians, Colossians
  { verse: "The fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control.", verseRef: "Galatians 5:22-23" },
  { verse: "Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.", verseRef: "Galatians 6:9" },
  { verse: "I have been crucified with Christ and I no longer live, but Christ lives in me.", verseRef: "Galatians 2:20" },
  { verse: "So in Christ Jesus you are all children of God through faith.", verseRef: "Galatians 3:26" },
  { verse: "He chose us in him before the creation of the world to be holy and blameless in his sight.", verseRef: "Ephesians 1:4" },
  { verse: "I pray that out of his glorious riches he may strengthen you with power through his Spirit in your inner being.", verseRef: "Ephesians 3:16" },
  { verse: "Now to him who is able to do immeasurably more than all we ask or imagine, according to his power that is at work within us.", verseRef: "Ephesians 3:20" },
  { verse: "Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you.", verseRef: "Ephesians 4:32" },
  { verse: "For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God.", verseRef: "Ephesians 2:8" },
  { verse: "Finally, be strong in the Lord and in his mighty power.", verseRef: "Ephesians 6:10" },
  { verse: "Let the peace of Christ rule in your hearts, since as members of one body you were called to peace.", verseRef: "Colossians 3:15" },
  { verse: "Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.", verseRef: "Colossians 3:23" },
  { verse: "As God's chosen people, holy and dearly loved, clothe yourselves with compassion, kindness, humility, gentleness and patience.", verseRef: "Colossians 3:12" },
  // Thessalonians, Timothy, Hebrews, James
  { verse: "Therefore encourage one another and build each other up, just as in fact you are doing.", verseRef: "1 Thessalonians 5:11" },
  { verse: "Rejoice always, pray continually, give thanks in all circumstances; for this is God's will for you in Christ Jesus.", verseRef: "1 Thessalonians 5:16-18" },
  { verse: "The Lord is faithful, and he will strengthen you and protect you.", verseRef: "2 Thessalonians 3:3" },
  { verse: "For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline.", verseRef: "2 Timothy 1:7" },
  { verse: "I have fought the good fight, I have finished the race, I have kept the faith.", verseRef: "2 Timothy 4:7" },
  { verse: "For we do not have a high priest who is unable to empathize with our weaknesses, but one who has been tempted in every way, just as we are — yet he did not sin. Let us approach God's throne of grace with confidence.", verseRef: "Hebrews 4:15-16" },
  { verse: "Let us hold unswervingly to the hope we profess, for he who promised is faithful.", verseRef: "Hebrews 10:23" },
  { verse: "Now faith is confidence in what we hope for and assurance about what we do not see.", verseRef: "Hebrews 11:1" },
  { verse: "Let us throw off everything that hinders and the sin that so easily entangles, and let us run with perseverance the race marked out for us.", verseRef: "Hebrews 12:1" },
  { verse: "Fixing our eyes on Jesus, the pioneer and perfecter of faith.", verseRef: "Hebrews 12:2" },
  { verse: "Never will I leave you; never will I forsake you.", verseRef: "Hebrews 13:5" },
  { verse: "Jesus Christ is the same yesterday and today and forever.", verseRef: "Hebrews 13:8" },
  { verse: "We have this hope as an anchor for the soul, firm and secure.", verseRef: "Hebrews 6:19" },
  { verse: "No discipline seems pleasant at the time, but painful. Later on, however, it produces a harvest of righteousness and peace for those who have been trained by it.", verseRef: "Hebrews 12:11" },
  { verse: "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.", verseRef: "James 1:5" },
  { verse: "Every good and perfect gift is from above, coming down from the Father of the heavenly lights.", verseRef: "James 1:17" },
  { verse: "Come near to God and he will come near to you.", verseRef: "James 4:8" },
  { verse: "Humble yourselves before the Lord, and he will lift you up.", verseRef: "James 4:10" },
  { verse: "The prayer of a righteous person is powerful and effective.", verseRef: "James 5:16" },
  // Peter, John
  { verse: "In his great mercy he has given us new birth into a living hope through the resurrection of Jesus Christ from the dead.", verseRef: "1 Peter 1:3" },
  { verse: "You are a chosen people, a royal priesthood, a holy nation, God's special possession.", verseRef: "1 Peter 2:9" },
  { verse: "Above all, love each other deeply, because love covers over a multitude of sins.", verseRef: "1 Peter 4:8" },
  { verse: "The God of all grace, who called you to his eternal glory in Christ, after you have suffered a little while, will himself restore you and make you strong, firm and steadfast.", verseRef: "1 Peter 5:10" },
  { verse: "By his wounds you have been healed.", verseRef: "1 Peter 2:24" },
  { verse: "If we confess our sins, he is faithful and just and will forgive us our sins and purify us from all unrighteousness.", verseRef: "1 John 1:9" },
  { verse: "You, dear children, are from God and have overcome them, because the one who is in you is greater than the one who is in the world.", verseRef: "1 John 4:4" },
  { verse: "Dear friends, let us love one another, for love comes from God. Everyone who loves has been born of God and knows God.", verseRef: "1 John 4:7" },
  { verse: "God is love. Whoever lives in love lives in God, and God in them.", verseRef: "1 John 4:16" },
  { verse: "There is no fear in love. But perfect love drives out fear.", verseRef: "1 John 4:18" },
  { verse: "For everyone born of God overcomes the world. This is the victory that has overcome the world, even our faith.", verseRef: "1 John 5:4" },
  // Revelation
  { verse: "Here I am! I stand at the door and knock. If anyone hears my voice and opens the door, I will come in and eat with that person, and they with me.", verseRef: "Revelation 3:20" },
  { verse: "He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain, for the old order of things has passed away.", verseRef: "Revelation 21:4" },
  { verse: "Do not be afraid. I am the First and the Last. I am the Living One; I was dead, and now look, I am alive for ever and ever!", verseRef: "Revelation 1:17-18" },
  // Additional encouraging passages
  { verse: "The Lord is close to the brokenhearted and saves those who are crushed in spirit.", verseRef: "Psalm 34:18" },
  { verse: "I can do all this through him who gives me strength.", verseRef: "Philippians 4:13" },
  { verse: "See what great love the Father has lavished on us, that we should be called children of God!", verseRef: "1 John 3:1" },
  { verse: "Cast all your anxiety on him because he cares for you.", verseRef: "1 Peter 5:7" },
  { verse: "Peace I leave with you; my peace I give you. Do not let your hearts be troubled and do not be afraid.", verseRef: "John 14:27" },
  { verse: "Carry each other's burdens, and in this way you will fulfil the law of Christ.", verseRef: "Galatians 6:2" },
  { verse: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary.", verseRef: "Isaiah 40:31" },
  { verse: "The Lord your God is with you, the Mighty Warrior who saves. He will take great delight in you; in his love he will no longer rebuke you, but will rejoice over you with singing.", verseRef: "Zephaniah 3:17" },
  { verse: "My grace is sufficient for you, for my power is made perfect in weakness.", verseRef: "2 Corinthians 12:9" },
  { verse: "You have searched me, Lord, and you know me. You know when I sit and when I rise; you perceive my thoughts from afar.", verseRef: "Psalm 139:1-2" },
  { verse: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.", verseRef: "Joshua 1:9" },
  { verse: "Above all else, guard your heart, for everything you do flows from it.", verseRef: "Proverbs 4:23" },
  { verse: "And surely I am with you always, to the very end of the age.", verseRef: "Matthew 28:20" },
  { verse: "Consider it pure joy, my brothers and sisters, whenever you face trials of many kinds, because you know that the testing of your faith produces perseverance.", verseRef: "James 1:2-3" },
  { verse: "He has made everything beautiful in its time.", verseRef: "Ecclesiastes 3:11" },
  { verse: "Because of the Lord's great love we are not consumed, for his compassions never fail. They are new every morning; great is your faithfulness.", verseRef: "Lamentations 3:22-23" },
  { verse: "Two are better than one, because they have a good return for their labour: if either of them falls down, one can help the other up.", verseRef: "Ecclesiastes 4:9-10" },
  { verse: "Even though I walk through the darkest valley, I will fear no evil, for you are with me; your rod and your staff, they comfort me.", verseRef: "Psalm 23:4" },
  { verse: "Are not five sparrows sold for two pennies? Yet not one of them is forgotten by God. You are worth more than many sparrows.", verseRef: "Luke 12:6-7" },
  { verse: "He heals the brokenhearted and binds up their wounds.", verseRef: "Psalm 147:3" },
  { verse: "God is our refuge and strength, an ever-present help in trouble.", verseRef: "Psalm 46:1" },
  { verse: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.", verseRef: "Jeremiah 29:11" },
  { verse: "Therefore do not worry about tomorrow, for tomorrow will worry about itself. Each day has enough trouble of its own.", verseRef: "Matthew 6:34" },
  { verse: "Come to me, all you who are weary and burdened, and I will give you rest.", verseRef: "Matthew 11:28" },
  { verse: "What, then, shall we say in response to these things? If God is for us, who can be against us?", verseRef: "Romans 8:31" },
  { verse: "Create in me a pure heart, O God, and renew a steadfast spirit within me.", verseRef: "Psalm 51:10" },
  { verse: "A person's steps are directed by the Lord. How then can anyone understand their own way?", verseRef: "Proverbs 20:24" },
  { verse: "Do not be anxious about anything; the peace of God, which transcends all understanding, will guard your hearts and minds in Christ Jesus.", verseRef: "Philippians 4:6-7" },
  { verse: "What no eye has seen, what no ear has heard, and what no human mind has conceived — the things God has prepared for those who love him.", verseRef: "1 Corinthians 2:9" },
  { verse: "But thanks be to God! He gives us the victory through our Lord Jesus Christ.", verseRef: "1 Corinthians 15:57" },
  { verse: "His divine power has given us everything we need for a godly life through our knowledge of him who called us by his own glory and goodness.", verseRef: "2 Peter 1:3" },
  { verse: "To him who is able to keep you from stumbling and to present you before his glorious presence without fault and with great joy.", verseRef: "Jude 1:24" },
  { verse: "Let your conversation be always full of grace, seasoned with salt, so that you may know how to answer everyone.", verseRef: "Colossians 4:6" },
  { verse: "If we are faithless, he remains faithful, for he cannot disown himself.", verseRef: "2 Timothy 2:13" },
  { verse: "All Scripture is God-breathed and is useful for teaching, rebuking, correcting and training in righteousness, so that the servant of God may be thoroughly equipped for every good work.", verseRef: "2 Timothy 3:16-17" },
  { verse: "But by the grace of God I am what I am, and his grace to me was not without effect.", verseRef: "1 Corinthians 15:10" },
  { verse: "But because of his great love for us, God, who is rich in mercy, made us alive with Christ even when we were dead in transgressions.", verseRef: "Ephesians 2:4-5" },
  { verse: "So then, just as you received Christ Jesus as Lord, continue to live your lives in him, rooted and built up in him, strengthened in the faith.", verseRef: "Colossians 2:6-7" },
  { verse: "Do not forget to do good and to share with others, for with such sacrifices God is pleased.", verseRef: "Hebrews 13:16" },
  { verse: "Repent, then, and turn to God, so that your sins may be wiped out, that times of refreshing may come from the Lord.", verseRef: "Acts 3:19" },
  { verse: "I have been crucified with Christ and I no longer live, but Christ lives in me. The life I now live in the body, I live by faith in the Son of God, who loved me and gave himself for me.", verseRef: "Galatians 2:20" },
  { verse: "In him we have redemption through his blood, the forgiveness of sins, in accordance with the riches of God's grace.", verseRef: "Ephesians 1:7" },
  { verse: "I pray that the eyes of your heart may be enlightened in order that you may know the hope to which he has called you.", verseRef: "Ephesians 1:18" },
  { verse: "Being strengthened with all power according to his glorious might so that you may have great endurance and patience.", verseRef: "Colossians 1:11" },
  { verse: "Godliness with contentment is great gain.", verseRef: "1 Timothy 6:6" },
  { verse: "Always be prepared to give an answer to everyone who asks you to give the reason for the hope that you have. But do this with gentleness and respect.", verseRef: "1 Peter 3:15" },
  { verse: "Let us not love with words or speech but with actions and in truth.", verseRef: "1 John 3:18" },
  { verse: "The Lord does not look at the things people look at; the Lord looks at the heart.", verseRef: "1 Samuel 16:7" },
  { verse: "For no word from God will ever fail.", verseRef: "Luke 1:37" },
  { verse: "Do to others as you would have them do to you.", verseRef: "Luke 6:31" },
  { verse: "Give, and it will be given to you. A good measure, pressed down, shaken together and running over, will be poured into your lap.", verseRef: "Luke 6:38" },
  { verse: "Who of you by worrying can add a single hour to your life?", verseRef: "Luke 12:25" },
  { verse: "Whoever drinks the water I give them will never thirst. Indeed, the water I give them will become in them a spring of water welling up to eternal life.", verseRef: "John 4:14" },
  { verse: "And we know that in all things God works for the good of those who love him.", verseRef: "Romans 8:28" },
  { verse: "If we live, we live for the Lord; and if we die, we die for the Lord. So, whether we live or die, we belong to the Lord.", verseRef: "Romans 14:8" },
  // Completing the 365
  { verse: "The Lord will fight for you; you need only to be still.", verseRef: "Exodus 14:14" },
  { verse: "Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the Lord your God is with you wherever you go.", verseRef: "Joshua 1:9" },
  { verse: "The name of the Lord is a strong tower; the righteous man runs into it and is safe.", verseRef: "Proverbs 18:10" },
  { verse: "Delight yourself in the Lord, and he will give you the desires of your heart.", verseRef: "Psalm 37:4" },
  { verse: "Blessed is the man who trusts in the Lord, whose trust is the Lord.", verseRef: "Jeremiah 17:7" },
  { verse: "The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning.", verseRef: "Lamentations 3:22-23" },
  { verse: "And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.", verseRef: "Philippians 4:7" },
  { verse: "Let the word of Christ dwell in you richly, teaching and admonishing one another in all wisdom.", verseRef: "Colossians 3:16" },
  { verse: "For to me, to live is Christ and to die is gain.", verseRef: "Philippians 1:21" },
  { verse: "Draw near to God, and he will draw near to you.", verseRef: "James 4:8" },
  { verse: "But he knows the way that I take; when he has tested me, I will come out as gold.", verseRef: "Job 23:10" },
  { verse: "Those who look to him are radiant, and their faces shall never be ashamed.", verseRef: "Psalm 34:5" },
  { verse: "The Lord upholds all who are falling and raises up all who are bowed down.", verseRef: "Psalm 145:14" },
  { verse: "He restores my soul. He leads me in paths of righteousness for his name's sake.", verseRef: "Psalm 23:3" },
  { verse: "You are precious in my eyes, and honoured, and I love you.", verseRef: "Isaiah 43:4" },
  { verse: "Fear not, for I am with you; be not dismayed, for I am your God; I will strengthen you, I will help you, I will uphold you with my righteous right hand.", verseRef: "Isaiah 41:10" },
  { verse: "The Lord is good, a stronghold in the day of trouble; he knows those who take refuge in him.", verseRef: "Nahum 1:7" },
  { verse: "He will rejoice over you with gladness; he will quiet you by his love; he will exult over you with loud singing.", verseRef: "Zephaniah 3:17" },
  { verse: "Return to your stronghold, O prisoners of hope; today I declare that I will restore to you double.", verseRef: "Zechariah 9:12" },
  { verse: "Blessed are those who mourn, for they shall be comforted.", verseRef: "Matthew 5:4" },
  { verse: "Your Father knows what you need before you ask him.", verseRef: "Matthew 6:8" },
  { verse: "Everyone who calls on the name of the Lord will be saved.", verseRef: "Romans 10:13" },
  { verse: "Now may the Lord of peace himself give you peace at all times in every way.", verseRef: "2 Thessalonians 3:16" },
  { verse: "Let us then with confidence draw near to the throne of grace, that we may receive mercy and find grace to help in time of need.", verseRef: "Hebrews 4:16" },
  { verse: "For you know that the testing of your faith produces steadfastness.", verseRef: "James 1:3" },
  { verse: "Casting all your anxieties on him, because he cares for you.", verseRef: "1 Peter 5:7" },
  { verse: "Beloved, I pray that all may go well with you and that you may be in good health, as it goes well with your soul.", verseRef: "3 John 1:2" },
  { verse: "The Lord bless you and keep you; the Lord make his face to shine upon you and be gracious to you.", verseRef: "Numbers 6:24-25" },
  { verse: "God is not unjust; he will not forget your work and the love you have shown him.", verseRef: "Hebrews 6:10" },
  { verse: "In all your ways acknowledge him, and he will make straight your paths.", verseRef: "Proverbs 3:6" },
  { verse: "For everything there is a season, and a time for every matter under heaven.", verseRef: "Ecclesiastes 3:1" },
  { verse: "Whoever refreshes others will be refreshed.", verseRef: "Proverbs 11:25" },
  { verse: "The light of the eyes rejoices the heart, and good news refreshes the bones.", verseRef: "Proverbs 15:30" },
  { verse: "A joyful heart is good medicine, but a crushed spirit dries up the bones.", verseRef: "Proverbs 17:22" },
  { verse: "Where there is no guidance, a people falls, but in an abundance of counsellors there is safety.", verseRef: "Proverbs 11:14" },
  { verse: "I am the resurrection and the life. Whoever believes in me, though he die, yet shall he live.", verseRef: "John 11:25" },
  { verse: "Come to me, all who labour and are heavy laden, and I will give you rest.", verseRef: "Matthew 11:28" },
  { verse: "But seek first the kingdom of God and his righteousness, and all these things will be added to you.", verseRef: "Matthew 6:33" },
  { verse: "Do not let your hearts be troubled, neither let them be afraid.", verseRef: "John 14:27" },
  { verse: "I am with you always, to the end of the age.", verseRef: "Matthew 28:20" },
  { verse: "Not by might, nor by power, but by my Spirit, says the Lord of hosts.", verseRef: "Zechariah 4:6" },
  { verse: "The Lord your God is in your midst, a mighty one who will save.", verseRef: "Zephaniah 3:17" },
  { verse: "He gives power to the faint, and to him who has no might he increases strength.", verseRef: "Isaiah 40:29" },
  { verse: "For I am sure that neither death nor life, nor angels nor rulers, nor things present nor things to come, will be able to separate us from the love of God.", verseRef: "Romans 8:38-39" },
  { verse: "And my God will supply every need of yours according to his riches in glory in Christ Jesus.", verseRef: "Philippians 4:19" },
];

// Deterministic hash of a string to a non-negative integer (djb2 variant)
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function getFallbackMessage(
  employeeName: string,
  needsExtraEncouragement: boolean,
  employeeId?: string
): { greeting: string; subtext: string; subject: string; verse: string; verseRef: string } {
  // Use the day of the year to rotate through messages
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Select message template from appropriate pool
  const messagePool = needsExtraEncouragement ? FOLLOWUP_ENCOURAGEMENT_MESSAGES : CHECKIN_MESSAGES;
  const messageIndex = dayOfYear % messagePool.length;
  const message = messagePool[messageIndex];

  // Select verse: unique per employee per day using a hash of their ID + day of year
  // Falls back to day-of-year rotation when no employee ID is available
  const verseSeed = employeeId
    ? hashString(`${employeeId}:${dayOfYear}`)
    : dayOfYear;
  const dailyVerse = DAILY_VERSES[verseSeed % DAILY_VERSES.length];

  return {
    greeting: message.greeting.replace("{name}", employeeName),
    subtext: message.subtext,
    subject: message.subject,
    verse: dailyVerse.verse,
    verseRef: dailyVerse.verseRef
  };
}

// Generate a unique encouraging message with Bible verse using Google Gemini API (FREE)
async function generateAIMessage(
  employeeName: string,
  needsExtraEncouragement: boolean,
  geminiApiKey: string
): Promise<{ greeting: string; subtext: string; subject: string; verse: string; verseRef: string } | null> {
  try {
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    
    const contextPrompt = needsExtraEncouragement
      ? `The employee indicated they were struggling or needed support in their last check-in. Be extra caring, gentle, and supportive. Acknowledge that things have been tough.`
      : `This is a regular daily check-in. Be warm, friendly, and encouraging.`;

    const prompt = `You are writing a daily wellbeing check-in email for an employee named ${employeeName}. Today is ${dayOfWeek}.

${contextPrompt}

Generate a unique, heartfelt message with an encouraging thought and a relevant Bible verse. The message should feel personal and sincere, not generic or corporate.

Respond ONLY with valid JSON (no markdown code blocks, no extra text):
{
  "greeting": "A warm, personal greeting using their name",
  "subtext": "A brief caring message about checking in on their wellbeing (1-2 sentences)",
  "subject": "A short, warm email subject line (under 50 characters)",
  "verse": "A Bible verse that relates to the message (just the verse text, no reference)",
  "verseRef": "The verse reference (e.g., Psalm 23:4 or Philippians 4:13)"
}

Be creative and vary your responses. Avoid clichés. The tone should be caring and human.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 500,
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    
    // Extract the text content from Gemini's response
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      console.error("No text content in Gemini response");
      return null;
    }

    // Clean up the response - remove markdown code blocks if present
    let cleanedText = textContent.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    // Parse the JSON response
    const messageData = JSON.parse(cleanedText) as {
      greeting: string;
      subtext: string;
      subject: string;
      verse: string;
      verseRef: string;
    };

    return {
      greeting: messageData.greeting,
      subtext: messageData.subtext,
      subject: messageData.subject,
      verse: messageData.verse,
      verseRef: messageData.verseRef
    };
  } catch (error) {
    console.error("Error generating AI message:", error);
    return null;
  }
}

// Internal query to get an employee's most recent mood check-in
export const getLastMoodForEmployee = internalQuery({
  args: {
    employeeId: v.id("employees"),
  },
  returns: v.union(v.literal("green"), v.literal("amber"), v.literal("red"), v.null()),
  handler: async (ctx, args): Promise<"green" | "amber" | "red" | null> => {
    // Get the employee's most recent check-in
    const lastCheckin = await ctx.db
      .query("moodCheckins")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .order("desc")
      .first();
    
    if (!lastCheckin) {
      return null;
    }
    
    return lastCheckin.mood;
  },
});

// Internal query to get last mood for multiple employees in batch
export const getLastMoodsForEmployees = internalQuery({
  args: {
    employeeIds: v.array(v.id("employees")),
  },
  returns: v.record(v.string(), v.union(v.literal("green"), v.literal("amber"), v.literal("red"), v.null())),
  handler: async (ctx, args): Promise<Record<string, "green" | "amber" | "red" | null>> => {
    const results: Record<string, "green" | "amber" | "red" | null> = {};
    
    for (const employeeId of args.employeeIds) {
      const lastCheckin = await ctx.db
        .query("moodCheckins")
        .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
        .order("desc")
        .first();
      
      results[employeeId as string] = lastCheckin?.mood ?? null;
    }
    
    return results;
  },
});

// Internal action to send daily mood check-in emails via Resend
export const sendDailyEmails = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; sentCount: number; errorCount: number; totalEmployees: number; aiGenerated: number } | { error: string }> => {
    // Get all employees from all organizations
    const employees = await ctx.runQuery(internal.employees.listAll);

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { error: "Resend API key not configured" };
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const useAI = !!geminiApiKey;

    if (!useAI) {
      // GEMINI_API_KEY not configured - using fallback static messages
    }

    // Get last mood for all employees in batch
    const employeeIds = employees.map(e => e._id as Id<"employees">);
    const lastMoods = await ctx.runQuery(internal.moodCheckins.getLastMoodsForEmployees, { employeeIds });

    let sentCount = 0;
    let errorCount = 0;
    let aiGenerated = 0;

    // Helper function to delay execution (respect rate limits)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (const employee of employees) {
      try {
        // Rate limit: 2 emails per second = 500ms delay between emails
        if (sentCount > 0) {
          await delay(500);
        }
        // Generate unique response URLs for each mood option
        const baseUrl = process.env.SITE_URL || "http://localhost:3000";

        // Generate a daily check-in token for this employee and store it
        const checkinToken = crypto.randomUUID().replace(/-/g, "");
        const today = new Date().toISOString().split("T")[0];
        const tokenExpiry = Date.now() + 36 * 60 * 60 * 1000; // 36 hours
        await ctx.runMutation(internal.moodCheckins.createCheckinToken, {
          employeeId: employee._id,
          token: checkinToken,
          date: today,
          expiresAt: tokenExpiry,
        });

        const greenUrl = `${baseUrl}/mood-response?employeeId=${employee._id}&mood=green&token=${checkinToken}`;
        const amberUrl = `${baseUrl}/mood-response?employeeId=${employee._id}&mood=amber&token=${checkinToken}`;
        const redUrl = `${baseUrl}/mood-response?employeeId=${employee._id}&mood=red&token=${checkinToken}`;

        const lastMood = lastMoods[employee._id as string];
        const needsExtraEncouragement = lastMood === "red";

        // Try to generate AI message, fall back to static if it fails
        let todaysMessage: { greeting: string; subtext: string; subject: string; verse: string; verseRef: string };
        
        if (useAI) {
          const aiMessage = await generateAIMessage(employee.firstName, needsExtraEncouragement, geminiApiKey);
          if (aiMessage) {
            todaysMessage = aiMessage;
            aiGenerated++;
          } else {
            // Fallback to static message if AI fails
            todaysMessage = getFallbackMessage(employee.firstName, needsExtraEncouragement, employee._id);
          }
        } else {
          todaysMessage = getFallbackMessage(employee.firstName, needsExtraEncouragement, employee._id);
        }

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Check-In</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">How are you feeling today, ${employee.firstName}?</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        ${todaysMessage.subtext}
      </p>

      <p style="color: #64748b; font-size: 14px; margin: 0 0 24px 0;">
        How are you feeling today?
      </p>

      <div style="margin: 0 0 32px 0;">
        <a href="${greenUrl}" style="display: block; background-color: #22c55e; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px; margin-bottom: 12px;">
          😊 I'm doing great!
        </a>

        <a href="${amberUrl}" style="display: block; background-color: #f59e0b; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px; margin-bottom: 12px;">
          😐 I'm okay
        </a>

        <a href="${redUrl}" style="display: block; background-color: #ef4444; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px;">
          😔 I could use some support
        </a>
      </div>

      <!-- Daily verse -->
      <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-left: 4px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 0 0 32px 0;">
        <p style="color: #3b82f6; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px 0;">Daily verse</p>
        <p style="color: #1e3a8a; font-size: 14px; line-height: 1.5; margin: 0;">
          <em>"${todaysMessage.verse}"</em><br>
          <span style="color: #3b82f6; font-weight: 600;">— ${todaysMessage.verseRef}</span>
        </p>
      </div>

      <p style="color: #94a3b8; font-size: 13px; margin: 0; text-align: center;">
        From <strong>${employee.organisation}</strong><br>
        Your response helps us create a supportive environment for everyone.
      </p>
    </div>
  </div>
</body>
</html>
        `;

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "R u OK <noreply@harbourweb.org>",
            to: employee.email,
            subject: `${employee.organisation} - ${todaysMessage.subject}`,
            html: emailHtml,
          }),
        });

        if (response.ok) {
          sentCount++;
        } else {
          const errorText = await response.text();
          console.error(`✗ Failed to send to ${employee.email}: ${response.status} ${errorText}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`✗ Exception sending to ${employee.email}:`, error);
        errorCount++;
      }
    }

    return {
      success: true,
      sentCount,
      errorCount,
      totalEmployees: employees.length,
      aiGenerated,
    };
  },
});
