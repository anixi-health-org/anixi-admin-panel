import { ComponentFixture, TestBed } from '@angular/core/testing';

import { configureLegacyComponentTest } from '../../testing/component-testbed';
import { CardComponent } from './card.component';

describe('CardComponent', () => {
  let component: CardComponent;
  let fixture: ComponentFixture<CardComponent>;

  beforeEach(async () => {
    await configureLegacyComponentTest([CardComponent]);

    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    component.cardValue = { label: 'Test', value: '0' };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
