# Welcome to your Convex + Next.js + Convex Auth app

This is a [Convex](https://convex.dev/) project created with [`npm create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Next.js](https://nextjs.org/) for optimized web hosting and page routing
- [Tailwind](https://tailwindcss.com/) for building great looking accessible UI
- [Convex Auth](https://labs.convex.dev/auth) for authentication

## functions to add:
-Manager login as view only
-Manager login as super user
-Add managers to login as organisation owner
-Review http being used and not https? 
-each manager should be able to add more organisations to manage from the edit page
-add email authentication when user creates orginasation
-add sidebar for buttons, include settings and such where user can add other super users instead of button at the top
-when opening a new account, dont allow using an org name that already exists
-a user can create multiple orgs, and be given access to multiple, just not with existing names org names
-add "forget password "feature" with resend through resend with magiclink
-create invite link for all employees to signup to that org , with token for that org (link for view only and editor)

## fix:
-submitting response with 0 info on the response shouldnt be accepted
-users on the phone has bad view
-error when adding yourself as a view only user
-auto routing when logging in and have access to multiple orgs
-signup as viewer removes you from invite list and gives access to the org owners perspective and their details are being used
-merge user tables to save all user data, each row should state email password and such, but also which org and type of role they have in the org from owner viewer or editor, then when someone logs in, if the same email is used that user can choose which org to access after logged in on the left sidebar as they are listed there

##
restructure: 
  on home page, a user should only be able to sign it or sign up with email and password (add email authentication and forgot password)
  then when logged in, if the user has no org, there is a button to create or and all orgs you have access to will be listed to click between
  then when someone sends you an invite link, then you get take to a page where you accept that you want your account to have access to that orgs info, but if the user doesnt have an account, they are redirected to signup page first, after which they can accept the view only accesss
  
    
## idea
-should responses be captured 4pm-4pm instead of that days hours, cause what if i only respond tomorrow about how yesterday was?
    -maybe make the question state "how was your monday?"

-consider to filter per person ?

## investigate
- when a user changes org name - how does it effect other managers given access to that org? (make user tied to org id not name)