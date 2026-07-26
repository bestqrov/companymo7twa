"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-accent">ArwaTube AI Engine</h1>
        <p className="mt-2 text-fg-subtle">Plan, write, and repurpose your video content with AI.</p>
      </div>
      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="rounded-md bg-accent px-6 py-3 font-medium text-zinc-900 hover:opacity-90"
      >
        Continue with Google
      </button>
    </div>
  );
}
