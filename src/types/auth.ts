export type UserRole = 'PATIENT' | 'NURSE' | 'DOCTOR' | 'ADMIN';

export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface AuthTokenResponse {
  accessToken: string;
  tokenType: string;
  role: UserRole;
  username: string;
  displayName: string;
  userId: string;
}

export interface DemoAccountInfo {
  username: string;
  displayName: string;
  role: UserRole;
  description: string;
}

export const DEMO_ACCOUNTS_INFO: DemoAccountInfo[] = [
  {
    username: 'dr_sharma',
    displayName: 'Dr. Ananya Sharma, MD',
    role: 'DOCTOR',
    description: 'Senior Medical Officer — Clinical decisions & hospital referrals',
  },
  {
    username: 'nurse_priya',
    displayName: 'Nurse Priya Nair, RN',
    role: 'NURSE',
    description: 'Triage Nurse — Vitals verification & urgency queue',
  },
  {
    username: 'patient_demo',
    displayName: 'Rajesh Kumar (Patient)',
    role: 'PATIENT',
    description: 'Citizen Patient — Self-intake symptom reporting & status',
  },
  {
    username: 'admin_user',
    displayName: 'System Administrator',
    role: 'ADMIN',
    description: 'System Oversight — Audit provenance & governance',
  },
];
