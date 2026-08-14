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
      heading: 'Chronic care, made continuous',
      description:
        'Support your Warriors between visits. Track medication adherence, mood, and vitals in one clinical dashboard.',
      caption: 'Continuous monitoring',
      image: '/hero-care.png',
    },
    {
      heading: 'Every patient, truly connected',
      description:
        'Telemedicine, shared records, and real-time insights link you to patients and their caregivers across Africa.',
      caption: 'Telemedicine ready',
      image: '/hero-insight.png',
    },
    {
      heading: 'Care beyond the clinic',
      description:
        'Coordinate with caregivers and Ayah, our AI companion, to guide and support patients around the clock.',
      caption: 'Connected support',
      image: '/hero-connect.png',
    },
  ];
  readonly stats: HeroStat[] = [
    { icon: 'users', value: '12+', label: 'Condition communities' },
    { icon: 'sparkles', value: '24/7', label: 'Ayah AI companion' },
    { icon: 'shield-check', value: 'POPIA', label: 'Secure & compliant' },
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
