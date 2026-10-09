import { ComponentFixture, TestBed } from '@angular/core/testing';

import { configureLegacyComponentTest } from '../../testing/component-testbed';
import { AdminPanelComponent } from './admin-panel.component';

describe('AdminPanelComponent', () => {
  let component: AdminPanelComponent;
  let fixture: ComponentFixture<AdminPanelComponent>;

  beforeEach(async () => {
    await configureLegacyComponentTest([AdminPanelComponent]);

    fixture = TestBed.createComponent(AdminPanelComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
