import { StaffRole } from './staff-role';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: StaffRole;
  sessionId: string;
  type: 'staff_access';
};
