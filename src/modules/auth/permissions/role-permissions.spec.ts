import { Permission } from './permission';
import { roleHasPermission } from './role-permissions';
import { StaffRole } from '../types/staff-role';

describe('role permissions', () => {
  it('allows owners to manage staff', () => {
    expect(roleHasPermission(StaffRole.OWNER, Permission.ManageStaff)).toBe(true);
  });

  it('does not allow support staff to manage staff', () => {
    expect(roleHasPermission(StaffRole.SUPPORT, Permission.ManageStaff)).toBe(false);
  });

  it('allows product managers to manage discounts', () => {
    expect(roleHasPermission(StaffRole.PRODUCT_MANAGER, Permission.ManageDiscounts)).toBe(true);
  });
});
