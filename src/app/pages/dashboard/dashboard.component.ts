import { Component } from '@angular/core';
import { EChartsCoreOption } from 'echarts/core';


const StaticCards1 = [
  {label: 'Total Users', icon: 'users', value: '423', index: '0'},
  {label: 'Active Users', icon: 'activity', value: '244', index: '1'},
  {label: 'Communities', icon: 'message-square', value: '42', index: '2'},
  {label: 'Articles', icon: 'file-text', value: '45', index: '3'},
]
const staticCards2 = [
  {label: 'Notifications Sent', icon: 'bell', value: '26', index: '4'},
  {label: 'Report Pending', icon: 'triangle-alert', value: '23', index: '5'},
  {label: 'Doctors Pending', icon: 'stethoscope', value: '0', index: '6'},
  {label: 'Suspended Users', icon: 'user-x', value: '0', index: '7'},
]

@Component({
  selector: 'app-dashboard',
  standalone: false,
  
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  cards = StaticCards1;
  cards2 = staticCards2;
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
