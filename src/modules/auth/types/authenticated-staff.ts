import { StaffRole } from './staff-role';

export type AuthenticatedStaff = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  sessionId: string;
};
