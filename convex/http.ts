import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { api } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);

// Handle mood check-in responses from email links
http.route({
  path: "/mood-response",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId");
    const mood = url.searchParams.get("mood");

    if (!employeeId || !mood) {
      return new Response("Missing parameters", { status: 400 });
    }

    if (mood !== "green" && mood !== "amber" && mood !== "red") {
      return new Response("Invalid mood value", { status: 400 });
    }

    try {
      await ctx.runMutation(api.moodCheckins.record, {
        employeeId: employeeId as any,
        mood: mood as "green" | "amber" | "red",
      });

      // Return a nice thank you page
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 48px;
      max-width: 500px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      color: #1e293b;
      margin: 0 0 16px 0;
      font-size: 32px;
    }
    p {
      color: #64748b;
      font-size: 18px;
      line-height: 1.6;
      margin: 0;
    }
    .emoji {
      font-size: 64px;
      margin-bottom: 24px;
    }
    .mood-green { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }
    .mood-amber { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
    .mood-red { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
  </style>
</head>
<body class="mood-${mood}">
  <div class="container">
    <div class="emoji">${mood === "green" ? "😊" : mood === "amber" ? "😐" : "😔"}</div>
    <h1>Thank you for sharing!</h1>
    <p>Your response has been recorded. We appreciate you taking the time to check in with us.</p>
    ${
      mood === "red"
        ? '<p style="margin-top: 16px; color: #ef4444; font-weight: 600;">If you need support, please reach out to your manager or HR.</p>'
        : ""
    }
  </div>
</body>
</html>
      `;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      });
    } catch (error) {
      console.error("Error recording mood:", error);
      return new Response("Error recording response", { status: 500 });
    }
  }),
});

export default http;
