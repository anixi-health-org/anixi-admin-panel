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

@Component({
  selector: 'app-analytics',
  standalone: false,
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css',
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  isLoading = true;
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
            const role = getUserRole(user) || 'unknown';
            acc[role] = (acc[role] ?? 0) + 1;
            return acc;
          }, {});

          const doctorStatusCounts = doctors.reduce<Record<string, number>>((acc, doctor) => {
            const status = normalizeVerificationStatus(doctor);
            const key = isDoctorVerificationCandidate(doctor) ? status : 'verified';
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {});

          const postStatusCounts = posts.reduce<Record<string, number>>((acc, post) => {
            const status = String(post['status'] ?? 'Draft');
            acc[status] = (acc[status] ?? 0) + 1;
            return acc;
          }, {});

          this.userRoleChart = this.buildPie('Users by role', roleCounts);
          this.doctorStatusChart = this.buildPie(
            'Doctors by verification',
            doctorStatusCounts,
          );
          this.postStatusChart = this.buildPie('Community posts', postStatusCounts);
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        },
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private buildPie(title: string, counts: Record<string, number>): EChartsOption {
    const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
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
      series: [
        {
          type: 'pie',
          radius: ['38%', '68%'],
          center: ['50%', '56%'],
          data,
          label: { formatter: '{b}: {c}', color: '#344256' },
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        },
      ],
    };
  }
}
