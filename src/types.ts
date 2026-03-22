export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface TechnicalDocument {
  id: string;
  name: string;
  size: string;
  date: string;
  url?: string;
  category?: 'norm' | 'manual' | 'best_practice';
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: 'technician' | 'admin';
  photoURL?: string;
}

export interface ErrorCode {
  code: string;
  manufacturer: string;
  description: string;
  solution: string;
}

export interface Note {
  id: string;
  userId: string;
  content: string;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface Reminder {
  id: string;
  userId: string;
  noteId?: string;
  title: string;
  description?: string;
  remindAt: string;
  status: 'pending' | 'triggered' | 'dismissed';
  createdAt: string;
}
