import { Injectable } from '@angular/core';
import { doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { IGroupPost } from '../../interfaces/IgroupPost';

@Injectable({
  providedIn: 'root'
})
export class PostService {

  constructor(private db: Firestore) { }

  async saveGroupPost(communityId: string, data: Partial<IGroupPost>) {
    const docRef = doc(this.db, 'group_posts', communityId);
    
    return setDoc(docRef, {
      ...data,
      timestamp: data.timeStamp || serverTimestamp(),
      repostTimeStamp: data.repostTimeStamp || serverTimestamp(),
      reported: data.reported ?? false,
      likes: data.likes || [],
      taggedFriends: data.taggedFriends || []
    }, {merge: true}) // true to avoid to erase field that non-mentionned
  }
}
