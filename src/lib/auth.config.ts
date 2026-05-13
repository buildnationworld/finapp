import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config — imported by `middleware.ts` and merged into
 * the full Node config in `auth.ts`. Do NOT import Prisma, bcrypt, or any
 * other Node-only module from this file.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) token.sub = user.id;
      return token;
    },
    session: ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
