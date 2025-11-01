// src/core/userRepository.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function createUser(data: Prisma.UserCreateInput) {
  return prisma.user.create({ data });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
}

type GoogleProfile = {
  sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
};

export async function upsertGoogleUser(profile: GoogleProfile) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: profile.email },
      update: {
        name: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
      },
      create: {
        email: profile.email,
        name: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
      },
    });

    await tx.account.upsert({
      where: {
        provider_subject: {
          provider: "google",
          subject: profile.sub,
        },
      },
      update: {
        userId: user.id,
      },
      create: {
        provider: "google",
        subject: profile.sub,
        userId: user.id,
      },
    });

    return user;
  });
}
