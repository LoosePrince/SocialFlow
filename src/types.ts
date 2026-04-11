export type ContentType = 'post' | 'project';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: number;
  role: 'admin' | 'user';
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  content: string;
  images: string[];
  createdAt: number;
  likeCount: number;
  commentCount: number;
  isRecommended: boolean;
}

export interface Project {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  title: string;
  coverUrl: string;
  summary: string;
  content: string; // Markdown
  attachments: string[]; // Simplifed to just URLs for consistency with my previous impl, or I can use objects if I want full fidelity
  createdAt: number;
  likeCount: number;
  commentCount: number;
  isRecommended: boolean;
}

export interface Like {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  contentId: string;
  contentType: ContentType;
  createdAt: number;
}

export interface Comment {
  id: string;
  contentId: string;
  contentType: ContentType;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  parentId?: string;
  mentionIds?: string[];
  createdAt: number;
}
