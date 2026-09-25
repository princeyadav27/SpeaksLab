/**
 * Client-safe auth flag. Only the publishable key is consulted: Next.js
 * inlines NEXT_PUBLIC_* variables identically into server and client
 * bundles, so this reads the same value in the browser and on the server.
 * (The secret key is intentionally NOT checked here — it does not exist in
 * client bundles, which would make the flag flip to false after hydration.)
 *
 * Deployments always set both keys together (see README), so the publishable
 * key alone is a reliable "is auth on" signal for UI gating.
 */
export const clerkUiEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
