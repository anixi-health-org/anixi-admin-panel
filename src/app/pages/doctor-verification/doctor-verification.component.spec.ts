import { ComponentFixture, TestBed } from '@angular/core/testing';

import { configureLegacyComponentTest } from '../../testing/component-testbed';
import { DoctorVerificationComponent } from './doctor-verification.component';

describe('DoctorVerificationComponent', () => {
  let component: DoctorVerificationComponent;
  let fixture: ComponentFixture<DoctorVerificationComponent>;

  beforeEach(async () => {
    await configureLegacyComponentTest([DoctorVerificationComponent]);

    fixture = TestBed.createComponent(DoctorVerificationComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
