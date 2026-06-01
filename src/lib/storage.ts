import { Song, Setlist, PerformanceSettings, UserProfile } from '../types';

const STORAGE_KEYS = {
  SONGS: 'chord_master_songs',
  SETLISTS: 'chord_master_setlists',
  SETTINGS: 'chord_master_settings',
  PROFILE: 'chord_master_profile',
};

export const storage = {
  saveSongs: (songs: Song[]) => {
    localStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(songs));
  },
  loadSongs: (): Song[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.SONGS);
    return data ? JSON.parse(data) : null;
  },
  saveSetlists: (setlists: Setlist[]) => {
    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
  },
  loadSetlists: (): Setlist[] | null => {
    const data = localStorage.getItem(STORAGE_KEYS.SETLISTS);
    return data ? JSON.parse(data) : null;
  },
  saveSettings: (settings: PerformanceSettings) => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },
  loadSettings: (): PerformanceSettings | null => {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : null;
  },
  saveProfile: (profile: UserProfile) => {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  },
  loadProfile: (): UserProfile | null => {
    const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
    return data ? JSON.parse(data) : null;
  },

  exportData: () => {
    const data = {
      songs: storage.loadSongs(),
      setlists: storage.loadSetlists(),
      settings: storage.loadSettings()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chord-master-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  importData: async (file: File): Promise<{ songs: Song[], setlists: Setlist[], settings: PerformanceSettings } | null> => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.songs && data.setlists && data.settings) {
        storage.saveSongs(data.songs);
        storage.saveSetlists(data.setlists);
        storage.saveSettings(data.settings);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Failed to import data:', error);
      return null;
    }
  },
};
