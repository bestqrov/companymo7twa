import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { ensureDefaultProject } from "@/server/projects";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    // NOTE: NextAuth's PrismaAdapter also writes raw (unencrypted) tokens to the
    // Account table as part of its own flow. The encrypted copies below on User
    // do not eliminate that exposure — see Phase 1 code review notes. A custom
    // adapter override to scrub Account token fields is a tracked follow-up.
    async signIn({ user, account }) {
      try {
        if (account?.access_token) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              googleAccessToken: encrypt(account.access_token),
              googleRefreshToken: account.refresh_token ? encrypt(account.refresh_token) : undefined,
            },
          });
        }

        await ensureDefaultProject(user.id);

        return true;
      } catch (error) {
        console.error("[auth] signIn callback failed for user", user.id, error);
        return false;
      }
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
