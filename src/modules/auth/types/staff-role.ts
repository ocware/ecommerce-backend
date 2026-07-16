import { StaffRole as PrismaStaffRole, StaffStatus as PrismaStaffStatus } from '@prisma/client';

export const StaffRole = PrismaStaffRole;
export type StaffRole = PrismaStaffRole;

export const StaffStatus = PrismaStaffStatus;
export type StaffStatus = PrismaStaffStatus;

export const STAFF_ROLES = [
  StaffRole.OWNER,
  StaffRole.ADMIN,
  StaffRole.PRODUCT_MANAGER,
  StaffRole.ORDER_MANAGER,
  StaffRole.SUPPORT,
  StaffRole.WAREHOUSE_STAFF,
] as const;
