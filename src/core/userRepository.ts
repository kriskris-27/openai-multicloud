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
