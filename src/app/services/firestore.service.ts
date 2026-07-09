import { Injectable } from '@angular/core';
import { collection, doc, Firestore, getDocs, onSnapshot, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { from, map, Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {

  constructor(
    private db: Firestore,
    private authService: AuthService
  ) { }

  getAllDoctors(): Observable<any[]> {
    const ref = collection(this.db, 'doctors');
    
    return from(getDocs(ref)).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => ({
          ...(doc.data() as Omit<any, 'id'>),
          id: doc.id
        }))
      )
    );
  }

  getUsers(): Observable<any[]> {
    return new Observable(observer => {
      const ref = collection(this.db, 'Users');
      const unsubscribe = onSnapshot(ref, snapshot => {
        const users = snapshot.docs.map(doc => ({
          ...(doc.data() as Omit<any, 'id'>),
          id: doc.id
        }));
        observer.next(users);
      });
      return () => unsubscribe()
    });
  }

  async updateDoctorStatus(doctorId: string, status: string): Promise<void> {
    const ref = doc(this.db, `doctors/${doctorId}`);
    const adminId = this.authService.getAdminUserId();
    await setDoc(
      ref,
      {
        verificationStatus: status,
        verifiedAt: serverTimestamp(),
        verifiedBy: adminId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  getDoctors(): Observable<any[]> {
    return new Observable(observer => {
      const ref = collection(this.db, 'doctors');
      const unsubscribe = onSnapshot(ref, snapshot => {
        const doctors = snapshot.docs.map(doc => ({
          ...(doc.data() as Omit<any, 'id'>),
          id: doc.id
        }));
        observer.next(doctors);
      }, error => observer.error(error));
      return () => unsubscribe();
    });
  }

  getDashboardStats(): Observable<{
    totalDoctors: number;
    pendingDoctors: number;
    approvedDoctors: number;
    rejectedDoctors: number;
    suspendedDoctors: number;
  }> {
    return this.getDoctors().pipe(
      map((doctors) => ({
        totalDoctors: doctors.length,
        pendingDoctors: doctors.filter(
          (d) => !d.verificationStatus || d.verificationStatus === 'pending'
        ).length,
        approvedDoctors: doctors.filter((d) => d.verificationStatus === 'approved').length,
        rejectedDoctors: doctors.filter((d) => d.verificationStatus === 'rejected').length,
        suspendedDoctors: doctors.filter((d) => d.verificationStatus === 'suspended').length,
      }))
    );
  }

  getDoctorsById(id:string): Observable<any | null> {
    return new Observable(observer => {
      const ref = doc(this.db, `doctors/${id}`);
      const unsubscribe =  onSnapshot(ref, snapshot => {
        if (snapshot.exists()) {
          observer.next({
            ...(snapshot.data() as Omit<any, 'id'>),
            id: snapshot.id,
          });
        } else {
          observer.next(null);
        }
      });
      return () => unsubscribe()
    });
  }

}
