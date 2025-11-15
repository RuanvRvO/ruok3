import { v } from "convex/values";
import { mutation, query, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// Mutation to record a mood check-in
export const record = mutation({
  args: {
    employeeId: v.id("employees"),
    mood: v.union(v.literal("green"), v.literal("amber"), v.literal("red")),
    note: v.optional(v.string()),
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
      // Update existing check-in
      await ctx.db.patch(existingCheckin._id, {
        mood: args.mood,
        note: args.note,
        timestamp: Date.now(),
      });
      return existingCheckin._id;
    } else {
      // Create new check-in
      const checkinId = await ctx.db.insert("moodCheckins", {
        employeeId: args.employeeId,
        organisation: employee.organisation,
        mood: args.mood,
        note: args.note,
        timestamp: Date.now(),
        date: today,
      });
      return checkinId;
    }
  },
});

// Query to get mood trends for an organization
export const getTrends = query({
  args: {
    days: v.optional(v.number()), // Number of days to look back, default 7
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    const user = await ctx.db.get(userId);

    const organisation = user?.organisation;
    if (!organisation) {
      return [];
    }

    const days = args.days || 7;
    const trends = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

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
        greenPercent: total > 0 ? Math.round((green / total) * 100) : 0,
        amberPercent: total > 0 ? Math.round((amber / total) * 100) : 0,
        redPercent: total > 0 ? Math.round((red / total) * 100) : 0,
      });
    }

    return trends;
  },
});

// Query to get today's check-ins for an organization
export const getTodayCheckins = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    const user = await ctx.db.get(userId);

    const organisation = user?.organisation;
    if (!organisation) {
      return [];
    }

    const today = new Date().toISOString().split("T")[0];

    const checkins = await ctx.db
      .query("moodCheckins")
      .withIndex("by_organisation_and_date", (q) =>
        q.eq("organisation", organisation).eq("date", today)
      )
      .collect();

    // Get employee details for each check-in
    const checkinsWithEmployees = await Promise.all(
      checkins.map(async (checkin) => {
        const employee = await ctx.db.get(checkin.employeeId);
        return {
          ...checkin,
          employeeName: employee?.firstName,
          employeeEmail: employee?.email,
        };
      })
    );

    return checkinsWithEmployees;
  },
});

// Internal action to send daily mood check-in emails via Resend
export const sendDailyEmails = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; sentCount: number; errorCount: number; totalEmployees: number } | { error: string }> => {
    // Get all employees from all organizations
    const employees: any = await ctx.runQuery(internal.employees.listAll);

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return { error: "Resend API key not configured" };
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const employee of employees) {
      try {
        // Generate unique response tokens for each mood option
        const baseUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace("/api", "") || process.env.CONVEX_SITE_URL;

        const greenUrl = `${baseUrl}/api/mood-response?employeeId=${employee._id}&mood=green`;
        const amberUrl = `${baseUrl}/api/mood-response?employeeId=${employee._id}&mood=amber`;
        const redUrl = `${baseUrl}/api/mood-response?employeeId=${employee._id}&mood=red`;

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
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">R u OK today?</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0;">
        Hi ${employee.firstName},<br><br>
        How are you feeling today? Let us know by clicking one of the buttons below:
      </p>

      <div style="margin: 32px 0;">
        <a href="${greenUrl}" style="display: block; background-color: #22c55e; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px; margin-bottom: 12px;">
          😊 I'm doing great!
        </a>

        <a href="${amberUrl}" style="display: block; background-color: #f59e0b; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px; margin-bottom: 12px;">
          😐 I'm okay
        </a>

        <a href="${redUrl}" style="display: block; background-color: #ef4444; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px;">
          😔 I need support
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 14px; margin: 32px 0 0 0; text-align: center;">
        Your response helps us support you and your team better.
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
            from: "R u OK <onboarding@resend.dev>", // Change this to your verified domain
            to: employee.email,
            subject: "Daily Check-In: How are you feeling today?",
            html: emailHtml,
          }),
        });

        if (response.ok) {
          sentCount++;
        } else {
          errorCount++;
          console.error(`Failed to send email to ${employee.email}:`, await response.text());
        }
      } catch (error) {
        errorCount++;
        console.error(`Error sending email to ${employee.email}:`, error);
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
