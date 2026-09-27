export const DEMO_SERVER_USERS: Record<
  string,
  { password: string; role: string; displayName: string; userId: string }
> = {
  dr_sharma: {
    userId: 'usr_doc_01',
    displayName: 'Dr. Ananya Sharma, MD',
    role: 'DOCTOR',
    password: 'doctorpassword123',
  },
  nurse_priya: {
    userId: 'usr_nur_01',
    displayName: 'Nurse Priya Nair, RN',
    role: 'NURSE',
    password: 'nursepassword123',
  },
  patient_demo: {
    userId: 'usr_pat_01',
    displayName: 'Rajesh Kumar (Patient)',
    role: 'PATIENT',
    password: 'patientpassword123',
  },
  admin_user: {
    userId: 'usr_adm_01',
    displayName: 'System Administrator',
    role: 'ADMIN',
    password: 'adminpassword123',
  },
};

export interface LoginPayload {
  username?: string;
  password?: string;
  role?: string;
}

export function handleAuthLoginRequest(payload: LoginPayload): { status: number; body: any } {
  const username = (payload?.username || '').trim();
  const password = (payload?.password || '').trim();

  if (!username || !password) {
    return {
      status: 400,
      body: { success: false, detail: 'Username and password are required.' },
    };
  }

  const user = DEMO_SERVER_USERS[username];
  if (user) {
    if (user.password !== password) {
      return {
        status: 401,
        body: { success: false, detail: 'Invalid credentials. Password does not match.' },
      };
    }
    const role = user.role;
    return {
      status: 200,
      body: {
        access_token: `mock_jwt_${username}_${Date.now()}`,
        token_type: 'bearer',
        role,
        username,
        display_name: user.displayName,
        user_id: user.userId,
      },
    };
  }

  return {
    status: 401,
    body: { success: false, detail: 'Invalid credentials. User not found.' },
  };
}
