import { StaffRole } from '../types/staff-role';
import { Permission } from './permission';

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  [StaffRole.OWNER]: Object.values(Permission),
  [StaffRole.ADMIN]: Object.values(Permission),
  [StaffRole.PRODUCT_MANAGER]: [
    Permission.ManageProducts,
    Permission.ManageDiscounts,
    Permission.ViewReports,
  ],
  [StaffRole.ORDER_MANAGER]: [
    Permission.ManageOrders,
    Permission.ManageCustomers,
    Permission.ViewReports,
  ],
  [StaffRole.SUPPORT]: [Permission.SupportCustomers, Permission.ManageCustomers],
  [StaffRole.WAREHOUSE_STAFF]: [Permission.ManageInventory, Permission.ManageOrders],
};

export function roleHasPermission(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
