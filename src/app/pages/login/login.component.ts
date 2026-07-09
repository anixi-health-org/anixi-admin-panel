import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface HeroSlide {
  heading: string;
  description: string;
  caption: string;
  image: string;
}

interface HeroStat {
  icon: string;
  value: string;
  label: string;
}

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  isLoading = false;
  showPassword = false;
  errorMessage = '';

  activeSlide = 0;
  readonly slides: HeroSlide[] = [
    {
      heading: 'The heartbeat of the ecosystem',
      description:
        'Verify clinicians, curate condition communities, and keep all three Anixi portals running smoothly.',
      caption: 'Full oversight',
      image: '/hero-insight.png',
    },
    {
      heading: 'Trusted care, verified',
      description:
        'Review and approve the doctors who support Warriors living with chronic conditions across Africa.',
      caption: 'Confident approvals',
      image: '/hero-care.png',
    },
    {
      heading: 'Content that empowers',
      description:
        'Publish health education that reaches the right condition communities at exactly the right moment.',
      caption: 'Stronger communities',
      image: '/hero-connect.png',
    },
  ];
  readonly stats: HeroStat[] = [
    { icon: 'layout-dashboard', value: '3', label: 'Connected portals' },
    { icon: 'users', value: '12+', label: 'Condition communities' },
    { icon: 'shield-check', value: 'POPIA', label: 'Compliant & secure' },
  ];

  private slideTimer?: ReturnType<typeof setInterval>;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit(): void {
    this.slideTimer = setInterval(() => {
      this.activeSlide = (this.activeSlide + 1) % this.slides.length;
    }, 6000);
  }

  ngOnDestroy(): void {
    if (this.slideTimer) {
      clearInterval(this.slideTimer);
    }
  }

  goToSlide(index: number): void {
    this.activeSlide = index;
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const { email, password } = this.loginForm.value;

    try {
      await this.authService.signIn(email, password);
      await this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      const firebaseError = error as { code?: string; message?: string };
      if (firebaseError.code === 'auth/invalid-credential') {
        this.errorMessage = 'Invalid email or password.';
      } else if (firebaseError.code === 'auth/too-many-requests') {
        this.errorMessage = 'Too many attempts. Please try again later.';
      } else {
        this.errorMessage =
          firebaseError.message || 'Sign in failed. Please try again.';
      }
    } finally {
      this.isLoading = false;
    }
  }
}
