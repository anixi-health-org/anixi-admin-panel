import {
  approvalBlockReasons,
  buildVerificationChecklist,
  canApproveDoctor,
  isPracticeProfileComplete,
  requiredDocumentsSummary,
} from './doctor-verification.utils';
import { DoctorRecord } from './doctor-record.utils';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function baseDoctor(overrides: Partial<DoctorRecord> = {}): DoctorRecord {
  return {
    id: 'doc-1',
    fullName: 'Dr Test',
    email: 'doctor@test.com',
    identityVerified: false,
    hpcsaRegistrationNumber: 'MP123',
    hpcsaManuallyVerified: false,
    hpcsaCertificateUrl: 'https://example.com/cert.pdf',
    practiceLicenseUrl: '',
    practiceName: 'Test Practice',
    medicalSpecialty: 'GP',
    practiceType: ['in-practice', 'telehealth'],
    ...overrides,
  };
}

function run(): void {
  // Happy path — profile essentials from the mobile app are enough to approve
  assert(canApproveDoctor(baseDoctor()), 'complete doctor should be approvable');
  assert(
    isPracticeProfileComplete(baseDoctor()),
    'practice profile should be complete'
  );

  // McRoy-style: admin flags not set yet, optional licence missing, location empty
  assert(
    canApproveDoctor(
      baseDoctor({
        identityVerified: false,
        hpcsaManuallyVerified: false,
        practiceLicenseUrl: '',
        practiceCity: '',
        practiceProvince: '',
        practiceAddress: '',
      })
    ),
    'provided profile without admin stamps must be approvable'
  );

  // Missing identity data
  assert(
    !canApproveDoctor(baseDoctor({ fullName: '', displayName: '', email: '' })),
    'missing name/email must block approve'
  );

  // Missing HPCSA registration number
  assert(
    !canApproveDoctor(
      baseDoctor({ hpcsaRegistrationNumber: '', licenseNumber: '' })
    ),
    'missing registration must block approve'
  );

  // Optional licence missing must NOT block
  const missingLicence = baseDoctor({ practiceLicenseUrl: '' });
  const docsMissing = requiredDocumentsSummary(missingLicence);
  assert(docsMissing.done === true, 'optional licence must not fail docs');
  assert(canApproveDoctor(missingLicence), 'optional licence must not block approve');

  // Rejected document blocks
  const rejected = baseDoctor({
    documentReviews: {
      hpcsa_certificate: { status: 'rejected' },
    },
  });
  assert(!canApproveDoctor(rejected), 'rejected document must block approve');

  // Replacement requested blocks
  const replacement = baseDoctor({
    documentReviews: {
      hpcsa_certificate: { status: 'requires_replacement' },
    },
  });
  assert(!canApproveDoctor(replacement), 'replacement requested must block approve');

  // Incomplete practice essentials
  const incompletePractice = baseDoctor({ practiceName: '' });
  assert(
    !isPracticeProfileComplete(incompletePractice),
    'empty practice name must be incomplete'
  );
  assert(
    !canApproveDoctor(incompletePractice),
    'incomplete practice must block approve'
  );

  // Address alone is not required
  assert(
    isPracticeProfileComplete(baseDoctor({ practiceAddress: '' })),
    'empty address must still be practice-complete'
  );

  const softOnly = baseDoctor({
    practiceName: '',
    medicalSpecialty: 'GP',
    specialty: 'GP',
    practiceType: '',
  });
  assert(
    !isPracticeProfileComplete(softOnly),
    'specialty alone must not mark practice complete'
  );

  const reasons = approvalBlockReasons(
    baseDoctor({ fullName: '', displayName: '', email: '', practiceName: '' })
  );
  assert(reasons.length >= 2, 'block reasons should list incomplete steps');
  assert(
    buildVerificationChecklist(baseDoctor()).every((i) => i.done),
    'checklist all done for complete doctor'
  );

  console.log('PASS doctor-verification.utils gate tests');
}

run();
