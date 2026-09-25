import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { clerkUiEnabled } from "@/lib/authFlags";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpeakLab — Think Deeper. Speak Freely.",
  description:
    "A personal space to practice, record, and improve your English — one conversation at a time.",
};

// Auth state (and the conditional ClerkProvider below) must be evaluated per
// request, never baked into a static build, otherwise a build without keys
// would ship pages whose sign-in controls can never appear.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  // ClerkProvider is skipped on deployments without Clerk keys so the site
  // stays browsable (auth disabled) instead of crashing at render time.
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {clerkUiEnabled ? <ClerkProvider>{children}</ClerkProvider> : children}
        <Analytics />
      </body>
    </html>
  );
}
