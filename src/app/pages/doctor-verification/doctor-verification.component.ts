import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';

const statCards = [
  {'label': 'Pending Review', 'value': '4', 'color': '#f69e23'},
  {'label': 'Approved',  'value': '2', 'color': '#2cab6f'},
  {'label': 'Rejected',  'value': '1', 'color': '#dc2928'},
  {'label': 'Suspended', 'value': '1', 'color': '#66758a'}
]
const customInput = [
  {'label': 'All (8)', 'value': 'all'},
  {'label': 'Pending (4)', 'value': 'pending'},
  {'label': 'Approved (2)', 'value': 'approved'},
  {'label': 'Rejected (1)', 'value': 'rejected'},
  {'label': 'Suspended (1)', 'value': 'suspended'},
]

const doctorsList = [
  {'fullName': 'Sarah Molefe', 'speciality': 'General' , 'city': 'Johannesburg', 
    'phoneNumber': '0953434344'},
  {'fullName': 'Thabo Nkosi', 'speciality': 'Cardiology' , 'city': 'Durban', 
    'phoneNumber': '0953434344'},
  {'fullName': 'Amina Osei', 'speciality': 'Pediatrics' , 'city': 'Pretoria', 
    'phoneNumber': '0953434344'},
  {'fullName': 'James van der berg', 'speciality': 'Psychiatry' , 'city': 'Pretoria', 
    'phoneNumber': '0953434344'},
  {'fullName': 'Fatima Abdi', 'speciality': 'Dermatology' , 'city': 'Bloemfontein', 
    'phoneNumber': '0953434344'},
  {'fullName': 'Peter Mahlangu', 'speciality': 'Oncology' , 'city': 'Polokwane', 
    'phoneNumber': '0953434344'},
  {'fullName': 'Lindiwe Dlamini', 'speciality': 'Gynecology' , 'city': 'East London', 
    'phoneNumber': '0953434344'},
  {'fullName': 'Sipho Zulu', 'speciality': 'Neurology' , 'city': 'Kimberly', 
    'phoneNumber': '0953434344'},
]

@Component({
  selector: 'app-doctor-verification',
  standalone: false,
  
  templateUrl: './doctor-verification.component.html',
  styleUrl: './doctor-verification.component.css'
})
export class DoctorVerificationComponent implements OnInit{
  statCards = statCards;
  customInput = customInput;
  doctorsList = doctorsList;
  verificationStatus! : FormControl;
  
  ngOnInit(): void {
    this.verificationStatus = new FormControl('all'); 
  }

}
