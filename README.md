# Welcome to your Convex + Next.js + Convex Auth app

This is a [Convex](https://convex.dev/) project created with [`npm create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Next.js](https://nextjs.org/) for optimized web hosting and page routing
- [Tailwind](https://tailwindcss.com/) for building great looking accessible UI
- [Convex Auth](https://labs.convex.dev/auth) for authentication

## functions to add:
-when opening a new account, dont allow using an org name that already exists
-improve emoji look of home page
-improve mobile phone web design
-create invite link for all employees to signup to that org , with token for that org (link for view only and editor)
    -make the existing links after genereted look better or remove

## fix:
-submitting response with 0 info on the response shouldnt be accepted
-auto routing when logging in and have access to multiple orgs
-signup as viewer removes you from invite list and gives access to the org owners perspective and their details are being used
-merge user tables to save all user data, each row should state email password and such, but also which org and type of role they have in the org from owner viewer or editor, then when someone logs in, if the same email is used that user can choose which org to access after logged in on the left sidebar as they are listed there
-password reset link sent, if want to reset password soon after no link arrives (is there a limit or block if you havent used the previous link?)

- when creating account and having no orgs, show something other than loading bubble
  
    
## idea
-should responses be captured 4pm-4pm instead of that days hours, cause what if i only respond tomorrow about how yesterday was?
    -maybe make the question state "how was your monday?"

-consider to filter per person ? code

## investigate
- when a user changes org name - how does it effect other managers given access to that org? (make user tied to org id not name)




-when inviting an email that exists, have a better error message

-when signed in is the landing page showing the correct instructions? and what if you are waiting for approval

-3 wrong password timeout?

also not getting verification email first time + workflow review
