import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`; Clerk's
 * helper is still called `clerkMiddleware`.
 *
 * Nothing is protected here on purpose. This only makes the signed-in user
 * available to routes and server components. Deciding which routes actually
 * require sign-in belongs to the features that need it: sending a prompt and
 * voting in slice 1, public thread viewing in slice 3.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Everything except Next internals and static files, plus all API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest))(?:.*)|api|trpc)(.*)",
  ],
};
