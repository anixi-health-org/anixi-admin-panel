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
    identityVerified: true,
    hpcsaRegistrationNumber: 'MP123',
    hpcsaManuallyVerified: true,
    hpcsaCertificateUrl: 'https://example.com/cert.pdf',
    practiceLicenseUrl: 'https://example.com/licence.pdf',
    documentReviews: {
      hpcsa_certificate: { status: 'verified' },
      practice_license: { status: 'verified' },
    },
    practiceName: 'Test Practice',
    medicalSpecialty: 'GP',
    practiceCity: 'Durban',
    practiceProvince: 'KZN',
    practiceAddress: '1 Main Rd',
    practiceType: 'Private',
    ...overrides,
  };
}

function run(): void {
  // Happy path
  assert(canApproveDoctor(baseDoctor()), 'complete doctor should be approvable');
  assert(isPracticeProfileComplete(baseDoctor()), 'practice profile should be complete');

  // Missing identity verification
  assert(
    !canApproveDoctor(baseDoctor({ identityVerified: false })),
    'missing identity must block approve'
  );

  // Missing HPCSA
  assert(
    !canApproveDoctor(baseDoctor({ hpcsaManuallyVerified: false })),
    'missing HPCSA must block approve'
  );

  // Missing required document upload
  const missingLicence = baseDoctor({ practiceLicenseUrl: '' });
  const docsMissing = requiredDocumentsSummary(missingLicence);
  assert(docsMissing.done === false, 'missing licence upload must fail docs');
  assert(docsMissing.missing.includes('Practice licence'), 'must report missing licence');
  assert(!canApproveDoctor(missingLicence), 'missing licence must block approve');

  // Rejected document
  const rejected = baseDoctor({
    documentReviews: {
      hpcsa_certificate: { status: 'verified' },
      practice_license: { status: 'rejected' },
    },
  });
  assert(!canApproveDoctor(rejected), 'rejected document must block approve');

  // Replacement requested
  const replacement = baseDoctor({
    documentReviews: {
      hpcsa_certificate: { status: 'requires_replacement' },
      practice_license: { status: 'verified' },
    },
  });
  assert(!canApproveDoctor(replacement), 'replacement requested must block approve');

  // Incomplete practice profile
  const incompletePractice = baseDoctor({ practiceAddress: '' });
  assert(
    !isPracticeProfileComplete(incompletePractice),
    'empty practice address must be incomplete'
  );
  assert(!canApproveDoctor(incompletePractice), 'incomplete practice must block approve');

  // Practice must not pass on a single soft field
  const softOnly = baseDoctor({
    practiceName: '',
    medicalSpecialty: 'GP',
    specialty: 'GP',
    practiceCity: '',
    practiceProvince: '',
    practiceAddress: '',
    practiceType: '',
  });
  assert(
    !isPracticeProfileComplete(softOnly),
    'specialty alone must not mark practice complete'
  );

  const reasons = approvalBlockReasons(
    baseDoctor({ identityVerified: false, hpcsaManuallyVerified: false })
  );
  assert(reasons.length >= 2, 'block reasons should list incomplete steps');
  assert(
    buildVerificationChecklist(baseDoctor()).every((i) => i.done),
    'checklist all done for complete doctor'
  );

  console.log('PASS doctor-verification.utils gate tests');
}

run();
