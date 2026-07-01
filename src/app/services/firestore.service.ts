import { Injectable } from '@angular/core';
import { collection, collectionData, doc, Firestore, getCountFromServer, getDocs, onSnapshot, query, Query, updateDoc, where } from '@angular/fire/firestore';
import { from, map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {

  constructor(private db: Firestore) { }

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

  updateDoctorStatus(doctorId:string, status:string) {
    const ref = doc(this.db, `doctors/${doctorId}`); 
    return updateDoc(ref, {
      verificationStatus: status
    });
  }

  getDoctors(): Observable<any[]> {
    return new Observable(observer => {
      const ref = collection(this.db, 'doctors');
      const unsubscribe =  onSnapshot(ref, snapshot => {
        const doctors = snapshot.docs.map(doc => ({
          ...(doc.data() as Omit<any, 'id'>),
          id: doc.id
        }));
        observer.next(doctors);
      });
      return () => unsubscribe()
    });
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
