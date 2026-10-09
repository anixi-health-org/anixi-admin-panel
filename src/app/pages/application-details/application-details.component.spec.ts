import { ComponentFixture, TestBed } from '@angular/core/testing';

import { configureLegacyComponentTest } from '../../testing/component-testbed';
import { ApplicationDetailsComponent } from './application-details.component';

describe('ApplicationDetailsComponent', () => {
  let component: ApplicationDetailsComponent;
  let fixture: ComponentFixture<ApplicationDetailsComponent>;

  beforeEach(async () => {
    await configureLegacyComponentTest([ApplicationDetailsComponent]);

    fixture = TestBed.createComponent(ApplicationDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
