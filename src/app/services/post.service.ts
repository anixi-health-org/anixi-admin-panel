import { Injectable } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from '@angular/fire/firestore';
import { IGroupPost } from '../../interfaces/IgroupPost';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class PostService {

  constructor(private db: Firestore) { }

  async saveGroupPost(postId: string, data: Partial<IGroupPost>) {
    const docRef = doc(this.db, 'group_posts', postId);
    
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
      userId: environment.ADMIN_USER_ID,
      hyperlink: data.hyperlink || '',
    }, {merge: true}) // true to avoid to erase field that non-mentionned
  }

  async deleteGroupPost(postId:string) {
    const docRef = doc(this.db, 'group_posts', postId);
    await deleteDoc(docRef);
  }
  fetchAdminPost(adminId:string): Observable<{data:any[], loading: boolean}> {
    return new Observable(observer => {
      const ref = collection(this.db, 'group_posts');
      const q = query(
        ref,
        where('userId', '==', adminId),
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
