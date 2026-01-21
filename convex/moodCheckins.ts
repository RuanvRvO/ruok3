import { v } from "convex/values";
import { mutation, query, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

// Query to check if employee has already submitted today
export const hasSubmittedToday = query({
  args: {
    employeeId: v.id("employees"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      return false;
    }

    const today = new Date().toISOString().split("T")[0];

    const existingCheckin = await ctx.db
      .query("moodCheckins")
      .withIndex("by_organisation_and_date", (q) =>
        q.eq("organisation", employee.organisation).eq("date", today)
      )
      .filter((q) => q.eq(q.field("employeeId"), args.employeeId))
      .first();

    return existingCheckin !== null;
  },
});

// Mutation to update an existing check-in with additional details
export const updateDetails = mutation({
  args: {
    employeeId: v.id("employees"),
    note: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    const today = new Date().toISOString().split("T")[0];

    // Find today's check-in
    const existingCheckin = await ctx.db
      .query("moodCheckins")
      .withIndex("by_organisation_and_date", (q) =>
        q.eq("organisation", employee.organisation).eq("date", today)
      )
      .filter((q) => q.eq(q.field("employeeId"), args.employeeId))
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
    mood: v.union(v.literal("green"), v.literal("amber"), v.literal("red")),
    note: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);

    if (!employee) {
      throw new Error("Employee not found");
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Check if employee already submitted today
    const existingCheckin = await ctx.db
      .query("moodCheckins")
      .withIndex("by_organisation_and_date", (q) =>
        q.eq("organisation", employee.organisation).eq("date", today)
      )
      .filter((q) => q.eq(q.field("employeeId"), args.employeeId))
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
      const nextDayStart = new Date(dateStr);
      nextDayStart.setDate(nextDayStart.getDate() + 1);
      const dayEndTimestamp = nextDayStart.getTime();

      // Count employees that existed on this day (should match how many got emails):
      // - Created before the day ended
      // - Either not deleted, or deleted on/after this day started (so they got the email)
      const employeeCountOnDay = allEmployees.filter(emp => {
        const wasCreated = emp.createdAt < dayEndTimestamp;
        const wasNotDeleted = !emp.deletedAt || emp.deletedAt >= dayStartTimestamp;
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

// Query to get check-ins from the last 24 hours for an organization
export const getTodayCheckins = query({
  args: {
    organisation: v.string(),
  },
  returns: v.array(v.any()),
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
    return checkinsWithEmployees.filter(c => c.employee);
  },
});

// Query to get check-ins from the last 24 hours for a specific group
export const getGroupTodayCheckins = query({
  args: {
    groupId: v.id("groups"),
    organisation: v.string(),
  },
  returns: v.array(v.any()),
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
    return checkinsWithEmployees.filter(c => c.employee);
  },
});

// Query to get historical check-ins for organization (excluding today)
export const getHistoricalCheckins = query({
  args: {
    days: v.optional(v.number()), // Number of days to look back, default 30
    organisation: v.string(),
  },
  returns: v.array(v.any()),
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
    const allCheckins = [];

    // Get check-ins from the past N days, excluding today
    for (let i = 1; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const checkins = await ctx.db
        .query("moodCheckins")
        .withIndex("by_organisation_and_date", (q) =>
          q.eq("organisation", organisation).eq("date", dateStr)
        )
        .collect();

      // Only include check-ins with notes
      const checkinsWithNotes = checkins.filter((c) => c.note && c.note.trim().length > 0);

      allCheckins.push(...checkinsWithNotes);
    }

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
      .filter(c => c.employee)
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
      const nextDayStart = new Date(dateStr);
      nextDayStart.setDate(nextDayStart.getDate() + 1);
      const dayEndTimestamp = nextDayStart.getTime();

      // Calculate group member count on this day (should match how many got emails)
      // Count memberships that were created before the next day started,
      // employees that weren't deleted yet, and memberships that weren't removed yet
      const memberCountOnDay = memberships.filter(m => {
        const employee = employeeMap.get(m.employeeId);
        if (!employee) return false;

        // If membership has createdAt, use it; otherwise fall back to employee's createdAt
        const effectiveCreatedAt = m.createdAt || employee.createdAt;
        const wasCreated = effectiveCreatedAt < dayEndTimestamp;

        // Check if employee was not deleted or was deleted on/after this day started
        const wasNotDeleted = !employee.deletedAt || employee.deletedAt >= dayStartTimestamp;

        // Check if membership was not removed or was removed on/after this day started
        const wasNotRemoved = !m.removedAt || m.removedAt >= dayStartTimestamp;

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
        const wasCreated = effectiveCreatedAt < dayEndTimestamp;

        // Check if employee was not deleted or was deleted on/after this day started
        const wasNotDeleted = !employee.deletedAt || employee.deletedAt >= dayStartTimestamp;

        // Check if membership was not removed or was removed on/after this day started
        const wasNotRemoved = !membership.removedAt || membership.removedAt >= dayStartTimestamp;

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
  encouragement: string;
  verse: string;
  verseRef: string;
}> = [
  {
    greeting: "Hey {name}, how are you really doing today?",
    subtext: "Take a moment to check in with yourself. Your wellbeing matters.",
    subject: "A moment for you: How are you feeling?",
    encouragement: "Remember, you are never alone in whatever you're facing. Each day is a new opportunity.",
    verse: "The Lord is close to the brokenhearted and saves those who are crushed in spirit.",
    verseRef: "Psalm 34:18"
  },
  {
    greeting: "Good afternoon, {name}! How's your day going?",
    subtext: "We genuinely care about how you're doing. Let us know.",
    subject: "Checking in: How's your day?",
    encouragement: "Whatever today brings, know that you have the strength to face it.",
    verse: "I can do all things through Christ who strengthens me.",
    verseRef: "Philippians 4:13"
  },
  {
    greeting: "{name}, just checking in on you 💙",
    subtext: "Your mental health is important. How are things going?",
    subject: "We're thinking of you",
    encouragement: "You are valued and loved, exactly as you are today.",
    verse: "See what great love the Father has lavished on us, that we should be called children of God!",
    verseRef: "1 John 3:1"
  },
  {
    greeting: "Hi {name}, how are you feeling right now?",
    subtext: "This is your space to be honest about where you're at today.",
    subject: "Daily check-in: How are you?",
    encouragement: "It's okay to not be okay. Your feelings are valid and you matter.",
    verse: "Cast all your anxiety on him because he cares for you.",
    verseRef: "1 Peter 5:7"
  },
  {
    greeting: "Hey {name}, we wanted to see how you're doing",
    subtext: "Taking a moment to pause and reflect can make a difference.",
    subject: "How are you today?",
    encouragement: "Peace is possible even in the busiest of days. Take a breath.",
    verse: "Peace I leave with you; my peace I give you. Do not let your hearts be troubled and do not be afraid.",
    verseRef: "John 14:27"
  },
  {
    greeting: "{name}, how's everything going for you today?",
    subtext: "Your team wants to make sure you're doing okay.",
    subject: "Touching base: How are things?",
    encouragement: "You're part of a community that cares. You don't have to carry burdens alone.",
    verse: "Carry each other's burdens, and in this way you will fulfill the law of Christ.",
    verseRef: "Galatians 6:2"
  },
  {
    greeting: "Hi there {name}! How are you holding up?",
    subtext: "Whether it's a great day or a tough one, we're here for you.",
    subject: "Checking in on you",
    encouragement: "Difficult seasons don't last forever. Brighter days are ahead.",
    verse: "Weeping may stay for the night, but rejoicing comes in the morning.",
    verseRef: "Psalm 30:5"
  },
  {
    greeting: "{name}, taking a moment to check in with you",
    subtext: "Your feelings are valid. Let us know how you're doing.",
    subject: "A quick check-in",
    encouragement: "You were created with purpose. Your life has meaning and value.",
    verse: "For we are God's handiwork, created in Christ Jesus to do good works.",
    verseRef: "Ephesians 2:10"
  },
  {
    greeting: "Hey {name}, how's life treating you today?",
    subtext: "We hope you're doing well. Let us know either way.",
    subject: "How's your day going?",
    encouragement: "No matter what today holds, there is always hope for tomorrow.",
    verse: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.",
    verseRef: "Jeremiah 29:11"
  },
  {
    greeting: "{name}, just wanted to ask – how are you?",
    subtext: "Sometimes it helps to pause and reflect. We're listening.",
    subject: "R u OK today?",
    encouragement: "When life feels overwhelming, remember you don't have to figure it all out today.",
    verse: "Therefore do not worry about tomorrow, for tomorrow will worry about itself.",
    verseRef: "Matthew 6:34"
  },
  {
    greeting: "Good afternoon {name}! How are you feeling?",
    subtext: "Your wellbeing is a priority. Take a moment to check in.",
    subject: "Afternoon check-in",
    encouragement: "Rest is not a weakness – it's how we find renewal and strength.",
    verse: "Come to me, all you who are weary and burdened, and I will give you rest.",
    verseRef: "Matthew 11:28"
  },
  {
    greeting: "Hi {name}, hope you're having a good day!",
    subtext: "Let us know how you're really doing today.",
    subject: "How are you doing?",
    encouragement: "You are stronger than you know. Keep going, one step at a time.",
    verse: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles.",
    verseRef: "Isaiah 40:31"
  },
  {
    greeting: "{name}, we care about how you're doing",
    subtext: "Your mental health matters to us. How are things?",
    subject: "We care: How are you?",
    encouragement: "You are worthy of love and care, especially from yourself.",
    verse: "The Lord your God is with you, the Mighty Warrior who saves. He will take great delight in you.",
    verseRef: "Zephaniah 3:17"
  },
  {
    greeting: "Hey {name}, how's your energy today?",
    subtext: "Whether you're thriving or surviving, we want to know.",
    subject: "Energy check: How are you?",
    encouragement: "Even when you feel weak, there is strength available to you.",
    verse: "My grace is sufficient for you, for my power is made perfect in weakness.",
    verseRef: "2 Corinthians 12:9"
  },
  {
    greeting: "{name}, time for your daily wellbeing check",
    subtext: "A quick moment to reflect on how you're feeling.",
    subject: "Your daily wellbeing check",
    encouragement: "Today is a gift. Be gentle with yourself as you navigate it.",
    verse: "This is the day that the Lord has made; let us rejoice and be glad in it.",
    verseRef: "Psalm 118:24"
  },
  {
    greeting: "{name}, we're thinking of you today",
    subtext: "How are you feeling? We're here to listen.",
    subject: "You're on our minds",
    encouragement: "In moments of doubt, remember that you are seen and known.",
    verse: "You have searched me, Lord, and you know me. You know when I sit and when I rise.",
    verseRef: "Psalm 139:1-2"
  },
  {
    greeting: "Hi {name}, just reaching out to check on you",
    subtext: "Your wellbeing is important to us.",
    subject: "Reaching out to you",
    encouragement: "Courage doesn't mean you're not afraid – it means you keep going anyway.",
    verse: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.",
    verseRef: "Joshua 1:9"
  },
  {
    greeting: "{name}, how is your heart today?",
    subtext: "Sometimes we need to pause and check in with ourselves.",
    subject: "A heart check-in",
    encouragement: "Your heart matters. Take time to nurture it today.",
    verse: "Above all else, guard your heart, for everything you do flows from it.",
    verseRef: "Proverbs 4:23"
  },
  {
    greeting: "Hey {name}, sending you good thoughts today",
    subtext: "We hope today is treating you well.",
    subject: "Sending you good thoughts",
    encouragement: "Love surrounds you, even when you can't see it. You are not forgotten.",
    verse: "And surely I am with you always, to the very end of the age.",
    verseRef: "Matthew 28:20"
  },
  {
    greeting: "{name}, checking in – how are things?",
    subtext: "We value you and want to know how you're doing.",
    subject: "Quick check-in",
    encouragement: "Every challenge you face is making you stronger and more resilient.",
    verse: "Consider it pure joy, my brothers and sisters, whenever you face trials of many kinds, because you know that the testing of your faith produces perseverance.",
    verseRef: "James 1:2-3"
  },
  {
    greeting: "Good day {name}! How's everything with you?",
    subtext: "Take a moment to reflect on how you're feeling.",
    subject: "How's everything?",
    encouragement: "There is beauty in every day, even in the small moments. Look for it today.",
    verse: "He has made everything beautiful in its time.",
    verseRef: "Ecclesiastes 3:11"
  }
];

// Extra encouraging messages for employees who responded "red" yesterday
const FOLLOWUP_ENCOURAGEMENT_MESSAGES: Array<{
  greeting: string;
  subtext: string;
  subject: string;
  encouragement: string;
  verse: string;
  verseRef: string;
}> = [
  {
    greeting: "{name}, we've been thinking about you 💙",
    subtext: "Yesterday was tough, and we wanted to check in on how you're doing today.",
    subject: "We're here for you",
    encouragement: "It takes courage to be honest about struggling. We're proud of you for sharing.",
    verse: "The Lord is my light and my salvation—whom shall I fear? The Lord is the stronghold of my life—of whom shall I be afraid?",
    verseRef: "Psalm 27:1"
  },
  {
    greeting: "Hi {name}, hoping today is a little brighter",
    subtext: "We noticed yesterday was difficult. How are you feeling now?",
    subject: "Hoping you're doing better",
    encouragement: "Hard days don't define you. Every sunrise brings new possibilities.",
    verse: "Because of the Lord's great love we are not consumed, for his compassions never fail. They are new every morning.",
    verseRef: "Lamentations 3:22-23"
  },
  {
    greeting: "{name}, just wanted you to know you're not alone",
    subtext: "We care about how you're doing, especially after a challenging day.",
    subject: "You're not alone",
    encouragement: "You don't have to face difficult times by yourself. Reach out – people care.",
    verse: "Two are better than one... If either of them falls down, one can help the other up.",
    verseRef: "Ecclesiastes 4:9-10"
  },
  {
    greeting: "Hey {name}, checking in with extra care today",
    subtext: "We know yesterday was hard. How are you holding up?",
    subject: "Checking in with care",
    encouragement: "Even in the darkest valleys, you are never walking alone.",
    verse: "Even though I walk through the darkest valley, I will fear no evil, for you are with me.",
    verseRef: "Psalm 23:4"
  },
  {
    greeting: "{name}, sending you strength today",
    subtext: "After a tough day, we wanted to make sure you're okay.",
    subject: "Sending you strength",
    encouragement: "Your struggles do not diminish your worth. You are incredibly valuable.",
    verse: "Are not five sparrows sold for two pennies? Yet not one of them is forgotten by God... you are worth more than many sparrows.",
    verseRef: "Luke 12:6-7"
  },
  {
    greeting: "Hi {name}, we hope today feels a bit lighter",
    subtext: "Yesterday was rough, and we're here to support you.",
    subject: "Here to support you",
    encouragement: "Healing takes time. Be patient and kind to yourself today.",
    verse: "He heals the brokenhearted and binds up their wounds.",
    verseRef: "Psalm 147:3"
  },
  {
    greeting: "{name}, your wellbeing matters deeply to us",
    subtext: "We're following up because we genuinely care about you.",
    subject: "Your wellbeing matters",
    encouragement: "It's okay to ask for help. Reaching out is a sign of strength, not weakness.",
    verse: "God is our refuge and strength, an ever-present help in trouble.",
    verseRef: "Psalm 46:1"
  }
];

// Get today's message based on the date and whether employee needs extra encouragement
function getTodaysMessage(
  employeeName: string,
  needsExtraEncouragement: boolean
): { greeting: string; subtext: string; subject: string; encouragement: string; verse: string; verseRef: string } {
  // Use the day of the year to rotate through messages
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  // Select from appropriate message pool
  const messagePool = needsExtraEncouragement ? FOLLOWUP_ENCOURAGEMENT_MESSAGES : CHECKIN_MESSAGES;
  const messageIndex = dayOfYear % messagePool.length;
  const message = messagePool[messageIndex];
  
  return {
    greeting: message.greeting.replace("{name}", employeeName),
    subtext: message.subtext,
    subject: message.subject,
    encouragement: message.encouragement,
    verse: message.verse,
    verseRef: message.verseRef
  };
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
  handler: async (ctx): Promise<{ success: boolean; sentCount: number; errorCount: number; totalEmployees: number } | { error: string }> => {
    // Get all employees from all organizations
    const employees = await ctx.runQuery(internal.employees.listAll);

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { error: "Resend API key not configured" };
    }

    // Get last mood for all employees in batch to check who needs extra encouragement
    const employeeIds = employees.map(e => e._id as Id<"employees">);
    const lastMoods = await ctx.runQuery(internal.moodCheckins.getLastMoodsForEmployees, { employeeIds });

    let sentCount = 0;
    let errorCount = 0;

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

        const greenUrl = `${baseUrl}/mood-response?employeeId=${employee._id}&mood=green`;
        const amberUrl = `${baseUrl}/mood-response?employeeId=${employee._id}&mood=amber`;
        const redUrl = `${baseUrl}/mood-response?employeeId=${employee._id}&mood=red`;

        // Check if employee's last response was red (needs extra encouragement)
        const lastMood = lastMoods[employee._id as string];
        const needsExtraEncouragement = lastMood === "red";

        // Get personalized message for today (with extra encouragement if needed)
        const todaysMessage = getTodaysMessage(employee.firstName, needsExtraEncouragement);

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
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">${todaysMessage.greeting}</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        ${todaysMessage.subtext}
      </p>

      <!-- Encouraging message with Bible verse -->
      <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-left: 4px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 0 0 32px 0;">
        <p style="color: #1e40af; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0; font-style: italic;">
          💙 ${todaysMessage.encouragement}
        </p>
        <p style="color: #1e3a8a; font-size: 14px; line-height: 1.5; margin: 0;">
          <em>"${todaysMessage.verse}"</em><br>
          <span style="color: #3b82f6; font-weight: 600;">— ${todaysMessage.verseRef}</span>
        </p>
      </div>

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
          console.log(`✓ Sent mood email to ${employee.email} (${employee.firstName})${needsExtraEncouragement ? " [extra encouragement]" : ""}`);
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
    };
  },
});
