/**
 * Server-only auth helpers. Never import this from a client component —
 * it dynamically loads the Clerk server runtime.
 *
 * Without Clerk keys in the environment the app stays browsable: auth is
 * treated as disabled, gated pages send visitors to a clear notice page,
 * and the recording/AI APIs answer with an explicit "not configured" error
 * instead of a server crash. As soon as both keys exist (locally or on
 * Vercel), every auth path switches on with no code changes.
 */

export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

/** The signed-in user's Clerk id, or null when signed out. */
export async function currentUserId(): Promise<string | null> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * Server-side gate for pages that need an account (recording flow, the
 * recordings library). Signed-out visitors are redirected to sign-in and
 * returned to `returnTo` afterwards. When Clerk is not configured on the
 * deployment, everyone is treated as signed out.
 */
export async function requireSignedIn(returnTo: string): Promise<string> {
  const userId = isClerkConfigured() ? await currentUserId() : null;
  if (!userId) {
    const { redirect } = await import("next/navigation");
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
    // redirect() always throws inside Next.js; this line is unreachable and
    // only satisfies the return type.
    throw new Error("Redirect to sign-in failed.");
  }
  return userId;
}
