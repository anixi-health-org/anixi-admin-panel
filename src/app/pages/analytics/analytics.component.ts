import { Component, OnDestroy, OnInit } from '@angular/core';
import { EChartsOption } from 'echarts';
import { Subscription, combineLatest } from 'rxjs';
import { FirestoreService } from '../../services/firestore.service';
import { PostService } from '../../services/post.service';
import {
  isDoctorVerificationCandidate,
  normalizeVerificationStatus,
} from '../../utils/doctor-record.utils';
import { getUserRole } from '../../utils/user-record.utils';

type MetricCard = {
  label: string;
  value: number;
  hint: string;
  tone?: 'green' | 'amber' | 'blue' | 'slate';
};

@Component({
  selector: 'app-analytics',
  standalone: false,
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css',
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  isLoading = true;
  loadError: string | null = null;
  metrics: MetricCard[] = [];
  userRoleChart: EChartsOption = {};
  doctorStatusChart: EChartsOption = {};
  postStatusChart: EChartsOption = {};
  private sub = new Subscription();

  constructor(
    private firestoreService: FirestoreService,
    private postService: PostService,
  ) {}

  ngOnInit(): void {
    this.sub.add(
      combineLatest([
        this.firestoreService.getDoctors(),
        this.firestoreService.getUsers(),
        this.postService.fetchAdminPost(),
      ]).subscribe({
        next: ([doctors, users, postsRes]) => {
          const posts = postsRes.data ?? [];
          const roleCounts = users.reduce<Record<string, number>>((acc, user) => {
            const role = this.formatRole(getUserRole(user) || 'unknown');
            acc[role] = (acc[role] ?? 0) + 1;
            return acc;
          }, {});

          const doctorStatusCounts = doctors
            .filter((doctor) => isDoctorVerificationCandidate(doctor))
            .reduce<Record<string, number>>((acc, doctor) => {
              const status = this.formatDoctorStatus(
                normalizeVerificationStatus(doctor.verificationStatus as string),
              );
              acc[status] = (acc[status] ?? 0) + 1;
              return acc;
            }, {});

          const postStatusCounts = posts.reduce<Record<string, number>>((acc, post) => {
            const status = String(post['status'] ?? 'Published');
            acc[status] = (acc[status] ?? 0) + 1;
            return acc;
          }, {});

          const totalUsers = users.length;
          const totalDoctors = Object.values(doctorStatusCounts).reduce((sum, n) => sum + n, 0);
          const totalPosts = posts.length;
          const pendingDoctors = doctorStatusCounts['Pending'] ?? 0;

          this.metrics = [
            {
              label: 'Total users',
              value: totalUsers,
              hint: 'All platform accounts',
            },
            {
              label: 'Clinical doctors',
              value: totalDoctors,
              hint: 'In verification pipeline',
              tone: 'blue',
            },
            {
              label: 'Pending review',
              value: pendingDoctors,
              hint: 'Awaiting credential check',
              tone: pendingDoctors > 0 ? 'amber' : 'slate',
            },
            {
              label: 'Community posts',
              value: totalPosts,
              hint: 'Articles and media',
              tone: 'green',
            },
          ];

          this.userRoleChart = this.buildPie('Users by role', roleCounts);
          this.doctorStatusChart = this.buildPie('Doctors by status', doctorStatusCounts);
          this.postStatusChart = this.buildPie('Community posts by status', postStatusCounts);
          this.isLoading = false;
          this.loadError = null;
        },
        error: () => {
          this.isLoading = false;
          this.loadError = 'Could not load analytics data.';
        },
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  hasChartData(option: EChartsOption): boolean {
    const series = option['series'];
    if (!Array.isArray(series) || !series.length) return false;
    const data = series[0]?.['data'];
    return Array.isArray(data) && data.some((item) => Number(item?.value ?? item) > 0);
  }

  private formatRole(role: string): string {
    const labels: Record<string, string> = {
      patient: 'Patients',
      doctor: 'Doctors',
      clinic_admin: 'Clinic admins',
      caregiver: 'Caregivers',
      admin: 'Admins',
      unknown: 'Other',
    };
    return labels[role] ?? role;
  }

  private formatDoctorStatus(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      suspended: 'Suspended',
      on_hold: 'On hold',
    };
    return labels[status] ?? status;
  }

  private buildPie(title: string, counts: Record<string, number>): EChartsOption {
    const data = Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));

    if (!data.length) {
      return {
        title: {
          text: title,
          subtext: 'No data yet',
          left: 'center',
          top: 'middle',
          textStyle: {
            fontSize: 15,
            fontWeight: 600,
            color: '#1c2621',
            fontFamily: '"Lora", Georgia, serif',
          },
          subtextStyle: {
            color: '#8a968e',
            fontSize: 13,
          },
        },
      };
    }

    return {
      title: {
        text: title,
        left: 'center',
        top: 8,
        textStyle: {
          fontSize: 15,
          fontWeight: 600,
          color: '#1c2621',
          fontFamily: '"Lora", Georgia, serif',
        },
      },
      color: ['#425950', '#6b8f7f', '#b86b0c', '#3a4f8f', '#b42318', '#8a968e'],
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        left: 'center',
        textStyle: { color: '#5c6b63' },
      },
      series: [
        {
          type: 'pie',
          radius: ['38%', '68%'],
          center: ['50%', '52%'],
          data,
          label: { formatter: '{b}: {c}', color: '#344256' },
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        },
      ],
    };
  }
}
