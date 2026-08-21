import { Injectable } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { NzNotificationPlacement } from 'ng-zorro-antd/notification';

@Injectable({
    providedIn: 'root',
})
export class UtilFunctions {
    public getValuebyStatus(status:string) {
        let color = '';
        let icon = '';
        let bgColor = '';
        switch(status) {
          case 'approved':
            color = '#2cab6f';
            bgColor = '#ebfbf3d1';
            icon = 'check-circle';
            break;
          case 'rejected':
            color = '#dc2928';
            icon = 'close-circle';
            bgColor = '#fad7d761';
            break;
          case 'suspended':
            color = '#66758a';
            icon = 'warning';
            bgColor = '#fbfbfb';
            break;
          case 'on_hold':
            color = '#9a6110';
            icon = 'pause-circle';
            bgColor = '#fbf4ea';
            break;
          default:
            color = '#f69e23';
            icon = 'history';
            bgColor = '#fbf3e8';
        }
        return {
          'color': color,
          'icon': icon,
          'background': bgColor
        };
      }
    public upperCaseFirstLetter(str?: string) : string | null {
    if (str)
      return str.substring(0, 1).toUpperCase() + str.substring(1, str.length);
    return null;
  }
}

export function displayNotificationMessage(status: string, message:string) {
  if (status == 'error') {
    return `An error occurs when ${message}. Please reload the page`; 
  }
  return message;
}

export const SUCCESS_NOTIFICATION_BOX_POSITION = {
  nzPlacement: <NzNotificationPlacement> 'topRight'
}

export const ERROR_NOTIFICATION_BOX_POSITION = {
  nzPlacement: <NzNotificationPlacement> 'bottomLeft'
}


export type CommunityDefinition = {
  id: string;
  label: string;
};

export const COMMUNITIES: CommunityDefinition[] = [
  {
    id: 'Motor',
    label: 'Motor Neuron Disease (MND)',
  },
  {
    id: 'HIV',
    label: 'HIV / AIDS',
  },
  {
    id: 'Heart Disease',
    label: 'Heart & CVD',

  },
  {
    id: 'Diabetes',
    label: 'Diabetes',

  },
  {
    id: 'GBV',
    label: 'Gender-Based Violence Recovery',
  },
  {
    id: 'Cancer',
    label: 'Cancer',
  },
  {
    id: 'Arthritis',
    label: 'Rheumatoid Arthritis',
  },
  {
    id: 'Kidney Failure',
    label: 'Kidney Disease',
  },
  {
    id: 'Lung Disease',
    label: 'Lung Disease',
  },
  {
    id: 'Lupus',
    label: 'Lupus',
  },
  {
    id: 'Tuberculosis',
    label: 'Tuberculosis',
  },
  {
    id: 'Mental Health',
    label: 'Mental Health Conditions',
  },
];

export function markAllFormControlsAsTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach((field) => {
        const control= formGroup.get(field);
        if (control instanceof FormGroup) {
        markAllFormControlsAsTouched(control);
        }
        else {
        control?.markAsTouched({onlySelf:true})
        }
    })
}