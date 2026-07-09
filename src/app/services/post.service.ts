import { Injectable } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, onSnapshot, orderBy, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { IGroupPost } from '../../interfaces/IgroupPost';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';


@Injectable({
  providedIn: 'root'
})
export class PostService {

  constructor(
    private db: Firestore,
    private authService: AuthService
  ) { }

  private resolveAdminUserId(): string {
    return this.authService.getAdminUserId() || environment.ADMIN_USER_ID;
  }

  async saveGroupPost(postId: string, data: Partial<IGroupPost>) {
    const docRef = doc(this.db, 'group_posts', postId);
    const adminUserId = this.resolveAdminUserId();
    
    return setDoc(docRef, {
      ...data,
      timeStamp: data.timeStamp || new Date(),
      repostTimeStamp: data.repostTimeStamp || new Date(),
      reported: data.reported ?? false,
      likes: data.likes || [],
      comments: data.comments || [],
      taggedFriends: data.taggedFriends || [],
      originalPostId: data.originalPostId || '',
      repostUserId: data.repostUserId || '',
      repostText: data.repostText || '',
      visibility: "Visible to public",
      userId: adminUserId,
      hyperlink: data.hyperlink || '',
    }, {merge: true})
  }

  async editPost(postId:string, data: Partial<IGroupPost>) {
    const docRef = doc(this.db, 'group_posts', postId);
    const updateData = {
      ...data,
      lastEditAt: new Date()
    }
    await updateDoc(docRef, updateData);
  }
  async deleteGroupPost(postId:string) {
    const docRef = doc(this.db, 'group_posts', postId);
    await deleteDoc(docRef);
  }
  fetchAdminPost(adminId?: string): Observable<{data:any[], loading: boolean}> {
    const resolvedAdminId = adminId || this.resolveAdminUserId();
    return new Observable(observer => {
      const ref = collection(this.db, 'group_posts');
      const q = query(
        ref,
        where('userId', '==', resolvedAdminId),
        where('groupName', '!=', 'main'),
        orderBy('groupName'),
        orderBy('timeStamp', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        }));
        observer.next({data: posts, loading: false});
      }, (error) => {
        observer.error(error);
      });
      return () => unsubscribe();
    })
  }
}
