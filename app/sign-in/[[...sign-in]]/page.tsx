import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { clerkUiEnabled } from "@/lib/authFlags";

export const metadata = {
  title: "Sign in — SpeakLab",
};

/** Where to land after signing in when the flow has no redirect_url of its own. */
const FALLBACK_REDIRECT = "/practice/topic";

export default function SignInPage() {
  return (
    <main className="paper-surface min-h-svh bg-ivory text-ink">
      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-5 py-10">
        <Link href="/" className="font-display text-[1.28rem] font-medium leading-none tracking-tight text-ink">
          SpeakLab
        </Link>
        <p className="mt-3 text-[13px] text-ink/55">
          Sign in to save your practice recordings to your account.
        </p>
        <div className="mt-8 w-full max-w-[26rem]">
          {clerkUiEnabled ? (
            <SignIn fallbackRedirectUrl={FALLBACK_REDIRECT} signUpUrl="/sign-up" />
          ) : (
            <div className="rounded-2xl border border-ink/10 bg-[#fbf7ef] p-6 text-center">
              <p className="font-display text-[1.35rem] text-ink">Sign-in is not set up on this deployment.</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink/60">
                Add <code className="rounded bg-[#f0e9dc] px-1.5 py-0.5 text-[12px]">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
                <code className="rounded bg-[#f0e9dc] px-1.5 py-0.5 text-[12px]">CLERK_SECRET_KEY</code> to the environment
                (see the README) to enable accounts and cloud-saved recordings.
              </p>
            </div>
          )}
        </div>
        <Link href="/practice" className="mt-8 text-[11px] tracking-[0.18em] text-cobalt">
          ‹ BACK TO PRACTICE
        </Link>
      </div>
    </main>
  );
}
