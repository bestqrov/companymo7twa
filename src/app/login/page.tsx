"use client";

import { signIn } from "next-auth/react";
import { useT } from "@/lib/i18n/useTranslation";

export default function LoginPage() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-accent">{t("login.title")}</h1>
        <p className="mt-2 text-fg-subtle">{t("login.subtitle")}</p>
      </div>
      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="rounded-md bg-accent px-6 py-3 font-medium text-zinc-900 hover:opacity-90"
      >
        {t("login.continueWithGoogle")}
      </button>
    </div>
  );
}
