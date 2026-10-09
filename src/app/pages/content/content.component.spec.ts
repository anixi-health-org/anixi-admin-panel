import { ComponentFixture, TestBed } from '@angular/core/testing';

import { configureLegacyComponentTest } from '../../testing/component-testbed';
import { ContentComponent } from './content.component';

describe('ContentComponent', () => {
  let component: ContentComponent;
  let fixture: ComponentFixture<ContentComponent>;

  beforeEach(async () => {
    await configureLegacyComponentTest([ContentComponent]);
    TestBed.overrideComponent(ContentComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(ContentComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
