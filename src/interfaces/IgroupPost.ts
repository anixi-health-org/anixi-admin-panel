  export interface IGroupPost {
  id: string;
  title?: string;
  comments: string[];
  userId: string;
  userName: string;
  firstName: string;
  lastName: string;
  groupName: string;
  text: string;
  postType: string; // ex: "Post"
  mediaType: string; // ex: "Picture"
  mediaUrl: string;
  hyperlink: string;
  originalPostId: string;
  repostText: string;
  repostUserId: string;
  repostTimeStamp: any; // Timestamp Firebase
  timeStamp: any;       // Timestamp Firebase
  visibility: string;   // ex: "Visible to public"
  reported: boolean;
  likes: string[];      // Pour les tableaux vides vus dans votre doc
  taggedFriends: string[];
  status?: string;
}