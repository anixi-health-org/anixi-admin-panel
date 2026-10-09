import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';
import { configureLegacyComponentTest } from '../../testing/component-testbed';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await configureLegacyComponentTest([LoginComponent], {
      imports: [ReactiveFormsModule],
      providers: [{ provide: AuthService, useValue: { login: () => Promise.resolve() } }],
    });

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
