import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EChartsCoreOption } from 'echarts/core';
import { Subscription } from 'rxjs';
import { COMMUNITIES } from '../../../../const';
import { FirestoreService } from '../../services/firestore.service';
import { PostService } from '../../services/post.service';

interface QuickAction {
  index: string;
  action: string;
  icon: string;
  route: string[];
  queryParams?: Record<string, string>;
}

const activities = [
  { index: '0',type: 'doctor', title: 'New doctor application', content: 'Dr. Sarah Molefe submitted verification', 
    bgColor: '#ebf5f3' , color: '#27a288' , createdAt: '5 min ago'},
  { index: '1',type: 'content', title: 'Content published', content: '"Managing Diabete in Summer" went live', 
    bgColor: '#ebf5fb' , color: '#6fb9e4', createdAt: '22 min ago'},
  { index: '2',type: 'report', title: 'User reported', content: 'Post flagged in HIV/AIDS community', 
    bgColor: '#fcebea' , color: '#dc2928', createdAt: '1 hr ago'},
  { index: '3',type: 'notification', title: 'Campaign sent', content: 'Weekly health tips to 8432 users', 
    bgColor: '#fef6e9' , color: '#492d03', createdAt: '2 hrs ago'},
  { index: '4',type: 'doctor', title: 'Doctor approved', content: 'Dr. Thabo Nkosi verified and badged', 
    bgColor: '#ebf5f3' , color: '#27a288', createdAt: '3 hrs ago'},
  { index: '5',type: 'moderation', title: 'User suspended', content: 'Account @toxic_user22 suspended for violations', 
    bgColor: '#fef6e9' , color: '#f69e23', createdAt: '5 hrs ago'},
];
const quickActions: QuickAction[] = [
  { index: '0', action: 'Create Article', icon: 'file-text', route: ['/content'], queryParams: { action: 'create' } },
  { index: '1', action: 'Send Notification', icon: 'bell', route: ['/content'], queryParams: { action: 'notify' } },
  { index: '2', action: 'Review Doctor', icon: 'stethoscope', route: ['/doctor-verification'], queryParams: { status: 'pending' } },
  { index: '3', action: 'View Reports', icon: 'triangle-alert', route: ['/content'], queryParams: { filter: 'reported' } },
  { index: '4', action: 'Manage Users', icon: 'users', route: ['/users'] },
];

@Component({
  selector: 'app-dashboard',
  standalone: false,
  
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  cards = [
    {label: 'Total Doctors', icon: 'users', value: '—', index: '0'},
    {label: 'Approved Doctors', icon: 'activity', value: '—', index: '1'},
    {label: 'Communities', icon: 'message-square', value: String(COMMUNITIES.length), index: '2'},
    {label: 'Admin Posts', icon: 'file-text', value: '—', index: '3'},
  ];
  cards2 = [
    {label: 'Published Posts', icon: 'bell', value: '—', index: '4'},
    {label: 'Rejected Doctors', icon: 'triangle-alert', value: '—', index: '5'},
    {label: 'Doctors Pending', icon: 'stethoscope', value: '—', index: '6'},
    {label: 'Suspended Doctors', icon: 'user-x', value: '—', index: '7'},
  ];
  activities = activities;
  actions = quickActions;
  isLoading = true;
  private sub = new Subscription();

  constructor(
    private firestoreService: FirestoreService,
    private postService: PostService,
    private router: Router
  ) {}

  runQuickAction(action: QuickAction): void {
    this.router.navigate(action.route, { queryParams: action.queryParams });
  }

  ngOnInit(): void {
    this.sub.add(
      this.firestoreService.getDashboardStats().subscribe((stats) => {
        this.cards[0].value = String(stats.totalDoctors);
        this.cards[1].value = String(stats.approvedDoctors);
        this.cards2[1].value = String(stats.rejectedDoctors);
        this.cards2[2].value = String(stats.pendingDoctors);
        this.cards2[3].value = String(stats.suspendedDoctors);
        this.isLoading = false;
      })
    );

    this.sub.add(
      this.postService.fetchAdminPost().subscribe((res) => {
        const published = res.data.filter((post) => post['status'] === 'Published').length;
        this.cards[3].value = String(res.data.length);
        this.cards2[0].value = String(published);
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  options: EChartsCoreOption = {
    color: ['#21a086'],
    tooltip : {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#6a79385'
        }
      }
    },
    grid: {
      left: '0%',
      right: '0%',
      bottom: '20%',
      outerBound: true
    },
    xAxis: [
      {
        type: 'category',
        boundaryGap: false,
        data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      },
    ],
    yAxis: [
      {
        type: 'value',
      },
    ],
    series: [
      {
        name: 'X-1',
        type: 'line',
        stack: 'counts',
        areaStyle: {},
        data: [120, 132, 101, 134, 90, 230, 210],
      },
    ]
  };

  option : EChartsCoreOption = {
    color: ['#21a086' ,'#269ed9'],
    legend: {},
    tooltip: {},
    grid: {
      left: '0%',
      right: '0%',
      outerBound: true
    },
    dataset: {
      // Provide a set of data.
      source: [
        ['engagement', 'Posts', 'Comments'],
        ['Mon', 43.3, 85.8],
        ['Tue', 83.1, 73.4],
        ['Wed', 83.1, 73.4],
        ['Thu', 83.1, 73.4],
        ['Fri', 83.1, 73.4],
        ['Sat', 83.1, 73.4],
        ['Sun', 83.1, 73.4],
        
      ],
    },
    // Declare an x-axis (category axis).
    // The category map the first column in the dataset by default.
    xAxis: { type: 'category' },
    // Declare a y-axis (value axis).
    yAxis: {},
    // Declare several 'bar' series,
    // every series will auto-map to each column by default.
    series: [{ type: 'bar' }, { type: 'bar' }],
  };

  mergeOption!: EChartsCoreOption;
}
