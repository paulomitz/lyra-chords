export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  timeSignature: string;
  content: string;
  tags: string[];
  coverUrl?: string;
  duration?: number; // Duration in seconds
  isFavorite?: boolean;
  genre?: string;
  lastModified?: number; // Timestamp
  capo?: number;
  pdfSheetMusicUrl?: string;
  spotifyUri?: string;
  youtubeUrl?: string;
}

export interface Setlist {
  id: string;
  name: string;
  description: string;
  songs: string[]; // Array of song IDs
  totalDuration?: string;
  lastModified: string;
  upcomingDate?: string;
  type: 'rehearsal' | 'festival' | 'gig' | 'other';
}

export type Language = 'en-US' | 'pt-PT' | 'pt-BR' | 'fr-FR' | 'es-ES' | 'zh-CN' | 'ja-JP' | 'de-DE' | 'it-IT';

export interface StreamingAccount {
  id: string;
  name: 'Spotify' | 'YouTube';
  connected: boolean;
  accessToken?: string;
  refreshToken?: string;
}

export interface PerformanceSettings {
  fontSize: number;
  chordColor: string;
  lyricColor: string;
  autoTranspose: boolean;
  visualClick: boolean;
  theme: 'system' | 'light' | 'dark';
  language: Language;
  streamingAccounts?: StreamingAccount[];
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  memberSince?: string;
  subscription?: string;
  avatarUrl?: string;
}

