import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk requires its middleware (Next.js 16 "proxy") to run so `auth()`
 * works in pages and route handlers. It does NOT protect any routes by
 * itself — protection happens close to the data:
 *   - /practice/topic and /practice/recordings gate rendering server-side.
 *   - /api/recordings/* and the AI routes check the session per request.
 *
 * Without Clerk keys in the environment (e.g. a throwaway preview), the
 * middleware is skipped entirely so the site stays browsable instead of
 * returning 500s; auth-gated pages show the sign-in notice page.
 */
const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

export default clerkConfigured
  ? clerkMiddleware()
  : function proxy() {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
