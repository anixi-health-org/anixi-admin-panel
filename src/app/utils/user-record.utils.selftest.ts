import {
  enrichUserWithDoctorProfile,
  enrichUserWithPracticeContext,
  formatUserRoleLabel,
  getUserRole,
  isClinicAdminUser,
  type PlatformUser,
} from './user-record.utils';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function user(overrides: Partial<PlatformUser> = {}): PlatformUser {
  return {
    id: 'u1',
    displayName: 'Adama Jarju',
    email: 'jarjuadama555@gmail.com',
    accountType: 'doctor',
    role: 'doctor',
    ...overrides,
  };
}

function run(): void {
  assert(getUserRole(user()) === 'doctor', 'plain doctor accountType stays doctor');
  assert(
    isClinicAdminUser(
      user({ accountKind: 'clinic_admin', requiresClinicalVerification: false })
    ),
    'accountKind clinic_admin is a clinic admin'
  );
  assert(
    getUserRole(user({ accountKind: 'clinic_admin' })) === 'clinic_admin',
    'clinic admin is not classified as doctor'
  );
  assert(
    formatUserRoleLabel('clinic_admin') === 'Clinic admin',
    'clinic admin label'
  );

  const enriched = enrichUserWithDoctorProfile(user(), {
    accountKind: 'clinic_admin',
    requiresClinicalVerification: false,
    joinIntent: 'clinic',
  });
  assert(getUserRole(enriched) === 'clinic_admin', 'doctor profile join marks clinic admin');
  const fromClinicOwnership = enrichUserWithPracticeContext(user(), {
    ownedClinic: { id: 'practice-1', name: 'UM6P Clinic' },
  });
  assert(
    getUserRole(fromClinicOwnership) === 'clinic_admin',
    'clinic owner is classified as clinic admin'
  );
  assert(
    fromClinicOwnership.managedClinicName === 'UM6P Clinic',
    'clinic owner shows managed clinic name'
  );
  assert(
    getUserRole(user({ accountType: 'staff', role: 'staff' })) === 'clinic_admin',
    'staff accountType is clinic admin'
  );
  assert(
    getUserRole(user({ accountType: null, role: null })) === 'patient',
    'missing accountType defaults to patient'
  );
  assert(
    getUserRole(user({ accountType: undefined, role: undefined, email: 'patient1@test.com' })) ===
      'patient',
    'unassigned mobile user is a patient'
  );
  assert(formatUserRoleLabel(getUserRole(user({ accountType: null, role: null }))) === 'Patient', 'patient label');
}

run();
