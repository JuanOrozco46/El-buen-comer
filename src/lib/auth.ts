import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import prisma from "./prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        try {
          // Use standard findUnique syntax. We fetch the hashed password to compare.
          const user = await prisma.user.findUnique({
            where: { userName: credentials.username }
          });

          if (!user) return null;

          const isPasswordValid = await bcrypt.compare(credentials.password, user.hashedPassword);

          if (!isPasswordValid) return null;

          return {
            id: user.id.toString(),
            name: user.name,
            email: user.userName, // using userName as email for nextAuth compat
            role: user.role
          };
        } catch (error) {
          console.error("Auth Verification Error", error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "fallback_development_secret_do_not_use_in_prod",
};
