import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Library as LibraryIcon, 
  ListMusic, 
  PlayCircle, 
  Settings as SettingsIcon,
  Menu,
  AccountCircle,
  Search,
  Plus,
  MoreVertical,
  ArrowLeft,
  Favorite,
  Speed,
  Timer,
  FormatSize,
  SettingsEthernet,
  DragIndicator,
  Edit,
  PlayArrow,
  AutoAwesome,
  Metronome,
  Info,
  FormatBold,
  FormatItalic,
  AddBox,
  TextSnippet,
  Fullscreen,
  Undo,
  Redo,
  History,
  Delete,
  Church,
  Stadium,
  AutoStories,
  Check
} from './components/Icons';
import { cn } from './lib/utils';
import { Toaster, toast } from 'sonner';
import { Song, Setlist, PerformanceSettings, Language, UserProfile } from './types';
import { useTranslation } from './hooks/useTranslation';
import { GoogleGenAI, Type } from "@google/genai";
import { storage } from './lib/storage';

// --- Gemini API Setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not defined. AI features will not work.');
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const importSongFromUrl = async (url: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: `Extract the song details from this URL: ${url}. 
    
    CRITICAL FORMATTING RULES:
    1. The 'content' field MUST use INLINE CHORDS in brackets like [G#].
    2. NEVER put chords on a separate line above the lyrics.
    3. Place the chord bracket [C] exactly before the syllable where the chord change occurs.
    4. Use section headers on their own lines (e.g., Intro, Verse 1, Chorus, Bridge) WITHOUT brackets around the header name itself, unless it's a chord.
    5. If a line has only chords, format it like: [G#] [Fm] [C#] [Eb].
    6. Ensure the output is a clean string ready for display.
    7. Clean the 'title' and 'artist' fields: remove suffixes like "(Official Video)", "(Lyrics)", "(Live)", etc.
    
    Example:
    [G#] Midnight [Fm] calls [C#] the echo [Eb] falls
    
    I need: title, artist, key, bpm, timeSignature, content, genre, and tags.`,
    config: {
      tools: [{ urlContext: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          artist: { type: Type.STRING },
          key: { type: Type.STRING },
          bpm: { type: Type.NUMBER },
          timeSignature: { type: Type.STRING },
          content: { type: Type.STRING },
          genre: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "artist", "content"]
      }
    }
  });
  
  return JSON.parse(response.text);
};

const importSongFromPdf = async (base64Pdf: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64Pdf
        }
      },
      {
        text: `Extract the song details from this PDF sheet music.
        
        CRITICAL FORMATTING RULES:
        1. The 'content' field MUST use INLINE CHORDS in brackets like [G#].
        2. NEVER put chords on a separate line above the lyrics.
        3. Place the chord bracket [C] exactly before the syllable where the chord change occurs.
        4. Use section headers on their own lines (e.g., Intro, Verse 1, Chorus, Bridge) WITHOUT brackets around the header name itself, unless it's a chord.
        5. If a line has only chords, format it like: [G#] [Fm] [C#] [Eb].
        6. Ensure the output is a clean string ready for display.
        
        Example:
        [G#] Midnight [Fm] calls [C#] the echo [Eb] falls
        
        I need: title, artist, key, bpm, timeSignature, content, genre, and tags.`
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          artist: { type: Type.STRING },
          key: { type: Type.STRING },
          bpm: { type: Type.NUMBER },
          timeSignature: { type: Type.STRING },
          content: { type: Type.STRING },
          genre: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "artist", "content"]
      }
    }
  });
  
  return JSON.parse(response.text);
};

const isSectionHeader = (line: string): boolean => {
  const clean = line.trim().toLowerCase();
  if (!clean) return false;
  
  // Remove markdown headers or braces if any
  let normalized = clean.replace(/^#+\s*/, '').replace(/^\[/, '').replace(/\]$/, '').trim();
  
  const headerTerms = [
    'intro', 'verse', 'chorus', 'bridge', 'solo', 'outro', 'coda', 'ending', 'vocal',
    'refrão', 'refrao', 'estrofe', 'ponte', 'instrumental', 'fim', 'final', 'tags',
    'pré-refrão', 'pre-refrão', 'pre-chorus', 'vocal', 'dobra', 'brass', 'interlúdio', 'interlude'
  ];
  
  const matchesTerm = headerTerms.some(term => {
    const regex = new RegExp(`(^|\\b)${term}(\\b|\\d|:|\\s|$)`);
    return regex.test(normalized);
  });
  
  if (matchesTerm && normalized.length <= 40) {
    return true;
  }
  
  if (normalized.length <= 15 && (
    normalized.startsWith('part ') || 
    normalized.startsWith('parte ') || 
    normalized.startsWith('section ') ||
    normalized === 'a' || normalized === 'b' || normalized === 'c' || normalized === 'd'
  )) {
    return true;
  }
  
  return false;
};

const formatHeader = (line: string): string => {
  return line.trim().replace(/^#+\s*/, '').replace(/^\[/, '').replace(/\]$/, '').trim();
};

// --- Mock Data ---
const MOCK_SONGS: Song[] = [
  { 
    id: '1', 
    title: 'Midnight Transmission', 
    artist: 'The Echo Logic', 
    key: 'G#', 
    bpm: 124, 
    timeSignature: '4/4', 
    content: '[G#] Midnight [Fm] calls [C#] the echo [Eb] falls', 
    tags: ['Electronic', 'Modern'],
    coverUrl: 'https://picsum.photos/seed/midnight/400/400',
    duration: 245,
    isFavorite: true,
    genre: 'Electronic',
    lastModified: Date.now() - 1000 * 60 * 60 * 2 // 2 hours ago
  },
  { 
    id: '2', 
    title: 'Neon Horizon', 
    artist: 'Synthetica Phase', 
    key: 'Cm', 
    bpm: 98, 
    timeSignature: '4/4', 
    content: '[Cm] Neon [Ab] lights [Eb] in the [Bb] night', 
    tags: ['Synthwave'],
    coverUrl: 'https://picsum.photos/seed/neon/400/400',
    duration: 182,
    isFavorite: false,
    genre: 'Synthwave',
    lastModified: Date.now() - 1000 * 60 * 60 * 24 // 1 day ago
  },
  { 
    id: '3', 
    title: 'Golden Hour Groove', 
    artist: 'Amber Collective', 
    key: 'D', 
    bpm: 110, 
    timeSignature: '4/4', 
    content: '[D] Golden [Bm] hour [G] feel the [A] power', 
    tags: ['Funk', 'Soul'],
    coverUrl: 'https://picsum.photos/seed/golden/400/400',
    duration: 215,
    isFavorite: true,
    genre: 'Funk',
    lastModified: Date.now() - 1000 * 60 * 60 * 5 // 5 hours ago
  },
  { 
    id: '4', 
    title: 'Subterranean Blues', 
    artist: 'Deep Core Quartet', 
    key: 'F#m', 
    bpm: 72, 
    timeSignature: '3/4', 
    content: '[F#m] Deep [D] down [A] in the [E] ground', 
    tags: ['Jazz', 'Blues'],
    coverUrl: 'https://picsum.photos/seed/deep/400/400',
    duration: 312,
    isFavorite: false,
    genre: 'Jazz',
    lastModified: Date.now() - 1000 * 60 * 60 * 48 // 2 days ago
  },
  { 
    id: '5', 
    title: 'Quantum Leap', 
    artist: 'The Particle Theory', 
    key: 'E', 
    bpm: 145, 
    timeSignature: '4/4', 
    content: '[E] Jumping [A] through [B] the [E] void', 
    tags: ['Prog Rock'],
    coverUrl: 'https://picsum.photos/seed/quantum/400/400',
    duration: 288,
    isFavorite: true,
    genre: 'Rock',
    lastModified: Date.now() - 1000 * 60 * 60 * 1 // 1 hour ago
  },
  { 
    id: '6', 
    title: 'Wonderwall', 
    artist: 'Oasis', 
    key: 'F#m', 
    bpm: 174, 
    timeSignature: '4/4', 
    content: `[Verse 1]
[Em7] Today is [G] gonna be the day that they're 
[Dsus4] gonna throw it back to [A7sus4] you
[Em7] By now you [G] should've somehow 
[Dsus4] realized what you gotta [A7sus4] do
[Em7] I don't believe that [G] anybody 
[Dsus4] feels the way I [A7sus4] do about you [Cadd9] [D] [G] [A7sus4] now`, 
    tags: ['Rock', 'Classic'],
    coverUrl: 'https://picsum.photos/seed/oasis/400/400',
    duration: 258,
    isFavorite: true,
    genre: 'Rock',
    lastModified: Date.now() - 1000 * 60 * 60 * 72 // 3 days ago
  },
];

const MOCK_SETLISTS: Setlist[] = [
  { id: 's1', name: 'Friday Night Live', description: 'Main set for the weekend', songs: ['2', '1', '3', '4'], totalDuration: '01:42:15', lastModified: '2 hours ago', type: 'gig' },
  { id: 's2', name: 'Church Rehearsal', description: 'Sunday morning prep', songs: ['1', '2', '3', '4', '5'], lastModified: 'Yesterday', type: 'rehearsal' },
  { id: 's3', name: 'Outdoor Festival', description: 'Summer stage', songs: ['1', '2', '3', '4', '5', '6'], upcomingDate: 'July 12', lastModified: '3 days ago', type: 'festival' },
];

// --- Components ---

const Icon = ({ name, className, style }: { name: string, className?: string, style?: React.CSSProperties }) => (
  <span className={cn("material-symbols-outlined", className)} style={style}>{name}</span>
);

const BottomNav = ({ language }: { language: Language }) => {
  const t = useTranslation(language);
  const location = useLocation();
  const navItems = [
    { path: '/', label: t.library, icon: 'library_music' },
    { path: '/setlists', label: t.setlists, icon: 'format_list_bulleted' },
    { path: '/perform', label: t.perform, icon: 'play_circle' },
    { path: '/settings', label: t.settings, icon: 'settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full h-20 bg-surface-container-low/80 backdrop-blur-xl border-t border-outline-variant/10 flex justify-around items-center px-4 pb-4 z-50">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link 
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-center px-4 py-1 rounded-xl transition-all duration-200 active:scale-90",
              isActive ? "text-primary font-bold bg-surface-container-highest/50" : "text-on-surface-variant opacity-60 hover:opacity-100 hover:text-primary"
            )}
          >
            <Icon name={item.icon} className={cn(isActive && "fill-1")} />
            <span className="font-label text-[10px] uppercase tracking-widest mt-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

const ImportModal = ({ isOpen, onClose, onImport, mode, language }: { isOpen: boolean, onClose: () => void, onImport: (song: Omit<Song, 'id'>) => void, mode: 'url' | 'pdf' | 'sheet_music', language: Language }) => {
  const t = useTranslation(language);
  const [url, setUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUrlImport = async () => {
    if (!url) return;
    setIsImporting(true);
    setError(null);
    try {
      const songData = await importSongFromUrl(url);
      onImport({
        ...songData,
        tags: songData.tags || [],
        lastModified: Date.now()
      });
      setUrl('');
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to import song. Please check the URL and try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        if (mode === 'sheet_music') {
          // For sheet music, we don't extract chords/lyrics, we just store the PDF
          onImport({
            title: file.name.replace('.pdf', ''),
            artist: 'Unknown Artist',
            key: 'C',
            bpm: 120,
            timeSignature: '4/4',
            content: '', // No text content
            tags: ['Sheet Music'],
            pdfSheetMusicUrl: reader.result as string, // Store the data URL
            lastModified: Date.now()
          });
          onClose();
        } else {
          const songData = await importSongFromPdf(base64);
          onImport({
            ...songData,
            tags: songData.tags || [],
            lastModified: Date.now()
          });
          onClose();
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setError('Failed to process PDF. Please try a different file.');
    } finally {
      setIsImporting(false);
    }
  };

  const getTitle = () => {
    if (mode === 'url') return t.import_via_link;
    if (mode === 'sheet_music') return t.import_via_sheet_music;
    return t.import_via_pdf;
  };

  const getDescription = () => {
    if (mode === 'url') return t.import_link_desc;
    if (mode === 'sheet_music') return t.import_sheet_music_desc;
    return t.import_pdf_desc;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative bg-surface-container-low w-full max-w-md rounded-3xl p-6 md:p-8 shadow-2xl border border-outline-variant/10"
          >
            <h2 className="font-headline text-xl md:text-2xl font-black text-on-surface mb-2">
              {getTitle()}
            </h2>
            <p className="text-on-surface-variant text-sm mb-6">
              {getDescription()}
            </p>
            
            <div className="space-y-4">
              {mode === 'url' ? (
                <div className="relative">
                  <Icon name="link" className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.cifraclub.com.br/..."
                    className="w-full bg-surface-container border-none focus:ring-2 focus:ring-primary py-3 md:py-4 pl-12 pr-4 text-on-surface placeholder-on-surface-variant rounded-xl font-body"
                  />
                </div>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-outline-variant/30 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-surface-container transition-colors"
                >
                  <Icon name="picture_as_pdf" className="text-3xl text-primary" />
                  <span className="text-xs font-label text-on-surface-variant uppercase tracking-widest font-bold">Click to upload PDF</span>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handlePdfImport} 
                    accept="application/pdf" 
                    className="hidden" 
                  />
                </div>
              )}
              
              {error && <p className="text-error text-xs font-medium px-2">{error}</p>}
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 md:py-4 bg-surface-container-highest text-on-surface rounded-xl font-label text-sm font-bold uppercase tracking-widest active:scale-95 transition-all"
                >
                  {t.cancel}
                </button>
                {mode === 'url' && (
                  <button
                    onClick={handleUrlImport}
                    disabled={isImporting || !url}
                    className="flex-1 py-3 md:py-4 bg-primary text-on-primary rounded-xl font-label text-sm font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                  >
                    {isImporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                        {t.importing}
                      </>
                    ) : (
                      <>
                        <Icon name="download" className="text-sm" />
                        {t.import}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const LibraryView = ({ songs, onDelete, onEdit, onToggleFavorite, onToggleSidebar, onAddSong, language }: { songs: Song[], onDelete: (id: string) => void, onEdit: (song: Song | null) => void, onToggleFavorite: (id: string) => void, onToggleSidebar: () => void, onAddSong: (song: Omit<Song, 'id'>) => void, language: Language }) => {
  const navigate = useNavigate();
  const t = useTranslation(language);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('A-Z');
  const [importMode, setImportMode] = useState<'url' | 'pdf' | 'sheet_music'>('url');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const filteredSongs = useMemo(() => {
    let result = songs.filter(s => 
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    switch (activeFilter) {
      case 'RECENT':
        result = [...result].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
        break;
      case 'FAVORITE':
        result = result.filter(s => s.isFavorite);
        break;
      case 'A-Z':
        result = [...result].sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'Z-A':
        result = [...result].sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'GENRE':
        result = [...result].sort((a, b) => (a.genre || '').localeCompare(b.genre || ''));
        break;
    }

    return result;
  }, [songs, searchQuery, activeFilter]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 md:px-6 pt-4 pb-40 max-w-5xl mx-auto w-full"
    >
      <header className="flex justify-between items-center mb-6 md:mb-10">
        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={onToggleSidebar}
            className="text-primary hover:bg-surface-container-highest p-1.5 md:p-2 rounded-lg transition-colors active:scale-90"
          >
            <Icon name="menu" />
          </button>
          <h1 className="text-primary font-black tracking-tighter text-2xl md:text-3xl font-headline">{t.library}</h1>
        </div>
        <button 
          onClick={() => navigate('/profile')}
          className="text-primary hover:bg-surface-container-highest p-1.5 md:p-2 rounded-lg transition-colors active:scale-90"
        >
          <Icon name="account_circle" className="text-2xl md:text-3xl" />
        </button>
      </header>

      <ImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImport={onAddSong}
        mode={importMode}
        language={language}
      />

      <section className="mb-8 md:mb-12 space-y-4 md:space-y-6">
        <div className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Icon name="search" className="text-outline" />
          </div>
          <input 
            className="w-full bg-surface-container-low border-none focus:ring-1 focus:ring-primary py-2.5 md:py-4 pl-12 pr-4 text-on-surface placeholder-on-surface-variant font-body rounded-xl transition-all text-sm md:text-base" 
            placeholder={t.search_songs} 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:max-w-[200px]">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Icon name="sort" className="text-primary text-sm" />
            </div>
            <select 
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-primary py-2 md:py-3 pl-12 pr-10 text-on-surface font-label text-xs md:text-sm font-bold rounded-xl appearance-none cursor-pointer transition-all hover:bg-surface-bright"
            >
              {[
                { value: 'A-Z', label: 'A-Z' },
                { value: 'Z-A', label: 'Z-A' },
                { value: 'RECENT', label: t.recent },
                { value: 'FAVORITE', label: t.favorite },
                { value: 'GENRE', label: t.genre }
              ].map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
              <Icon name="expand_more" className="text-on-surface-variant" />
            </div>
          </div>
          <div className="hidden sm:block flex-1 h-[1px] bg-outline-variant/20"></div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex justify-between items-end mb-4 px-2">
          <h2 className="font-label text-xs md:text-base font-black text-on-surface-variant uppercase tracking-[0.2em]">{t.all_songs} ({filteredSongs.length})</h2>
        </div>
        {filteredSongs.map((song, index) => (
          <div key={song.id} className="group flex items-center justify-between p-3 md:p-5 bg-surface-container-low rounded-2xl hover:bg-surface-container transition-all cursor-pointer border-l-4 border-transparent hover:border-primary shadow-sm hover:shadow-md">
            <div className="flex items-center gap-4 md:gap-6 overflow-hidden flex-1" onClick={() => navigate(`/perform/${song.id}`)}>
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl overflow-hidden flex-shrink-0 bg-surface-container-highest flex items-center justify-center shadow-inner">
                {song.coverUrl ? (
                  <img 
                    src={song.coverUrl} 
                    alt={song.title} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="font-label text-secondary font-bold text-base md:text-lg">{song.key}</span>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center">
                  <span className="text-on-surface font-headline font-black text-lg md:text-2xl truncate tracking-tight leading-tight">{song.title}</span>
                </div>
                <div className="flex items-center gap-2 md:gap-3 mt-0.5 md:mt-1">
                  <span className="text-on-surface-variant font-body text-xs md:text-base truncate opacity-70">{song.artist}</span>
                  {song.genre && (
                    <span className="font-label text-[8px] md:text-[10px] uppercase tracking-widest bg-primary/10 px-1.5 py-0.5 rounded-md text-primary font-black">
                      {song.genre}
                    </span>
                  )}
                  {song.pdfSheetMusicUrl && (
                    <span className="font-label text-[8px] md:text-[10px] uppercase tracking-widest bg-secondary/10 px-1.5 py-0.5 rounded-md text-secondary font-black flex items-center gap-1">
                      <Icon name="description" className="text-[10px]" />
                      PDF
                    </span>
                  )}
                  {song.isFavorite && <Icon name="favorite" className="text-primary text-[10px] md:text-xs fill-1" />}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-6 ml-2">
              <div className="hidden md:flex flex-col items-end">
                <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest font-black">BPM</span>
                <span className="font-label text-on-surface font-black text-sm md:text-base leading-none">{song.bpm}</span>
              </div>
              <div className="flex items-center gap-0.5 md:gap-2">
                <div className="relative group/menu">
                  <button className="p-1.5 md:p-2 hover:bg-surface-container-highest rounded-full transition-colors">
                    <Icon name="more_vert" className="text-outline-variant" />
                  </button>
                  <div className={cn(
                    "absolute right-0 bg-surface-container-highest rounded-xl shadow-2xl py-2 z-50 hidden group-hover/menu:block min-w-[140px]",
                    index === filteredSongs.length - 1 ? "bottom-full mb-1" : "top-full mt-1"
                  )}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(song.id);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-surface-bright flex items-center gap-2"
                    >
                      <Icon name={song.isFavorite ? "favorite" : "favorite_border"} className={cn("text-sm", song.isFavorite && "text-primary")} />
                      {song.isFavorite ? "Unfavorite" : "Favorite"}
                    </button>
                    <button 
                      onClick={() => { onEdit(song); navigate('/edit-song'); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-surface-bright flex items-center gap-2"
                    >
                      <Icon name="edit" className="text-sm" /> {t.edit_song}
                    </button>
                    <button 
                      onClick={() => onDelete(song.id)}
                      className="w-full px-4 py-2 text-left text-sm text-error hover:bg-error/10 flex items-center gap-2"
                    >
                      <Icon name="delete" className="text-sm" /> {t.delete_song}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-3">
        <AnimatePresence>
          {isAddMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              className="flex flex-col items-end gap-3 mb-2"
            >
              {[
                { label: t.manual_entry, icon: 'edit', action: () => { onEdit(null); navigate('/edit-song'); } },
                { label: t.import_link, icon: 'link', action: () => { setImportMode('url'); setIsImportModalOpen(true); } },
                { label: t.import_pdf, icon: 'picture_as_pdf', action: () => { setImportMode('pdf'); setIsImportModalOpen(true); } },
                { label: t.import_sheet_music, icon: 'library_music', action: () => { setImportMode('sheet_music'); setIsImportModalOpen(true); } },
              ].map((option, i) => (
                <button
                  key={option.label}
                  onClick={() => {
                    option.action();
                    setIsAddMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-3 bg-surface-container-high text-on-surface rounded-2xl shadow-xl border border-outline-variant/10 hover:bg-surface-bright transition-all active:scale-95 group"
                >
                  <span className="font-label text-xs font-bold uppercase tracking-widest">{option.label}</span>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Icon name={option.icon} />
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        
        <button 
          onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
          className={cn(
            "w-14 h-14 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-full shadow-lg flex items-center justify-center transition-all active:scale-90",
            isAddMenuOpen && "rotate-45"
          )}
        >
          <Icon name="add" className="text-3xl" />
        </button>
      </div>

      {isAddMenuOpen && (
        <div 
          className="fixed inset-0 z-30" 
          onClick={() => setIsAddMenuOpen(false)}
        />
      )}
    </motion.div>
  );
};

const SongEditorView = ({ onSave, initialSong, onCancel, language }: { onSave: (song: Song | Omit<Song, 'id'>) => void, initialSong: Song | null, onCancel: () => void, language: Language }) => {
  const navigate = useNavigate();
  const t = useTranslation(language);
  const [isCleaning, setIsCleaning] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'sheet'>('content');
  const [song, setSong] = useState<Omit<Song, 'id'> | Song>(initialSong || {
    title: '',
    artist: '',
    key: 'C',
    bpm: 120,
    timeSignature: '4/4',
    content: '',
    tags: [],
    coverUrl: '',
    youtubeUrl: ''
  });

  const handleSave = () => {
    if (!song.title) return;
    onSave(song);
    onCancel();
    navigate('/');
  };

  const handleCleanContent = async () => {
    if (!song.content) return;
    setIsCleaning(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: `Re-format this song content to use INLINE CHORDS in brackets like [G#].
        
        CRITICAL RULES:
        1. NEVER put chords on a separate line above the lyrics.
        2. Place the chord bracket [C] exactly before the syllable where the chord change occurs.
        3. Use section headers on their own lines (e.g., Intro, Verse 1, Chorus).
        4. If a line has only chords, format it like: [G#] [Fm] [C#] [Eb].
        5. Remove any extra text or formatting junk.
        
        Original Content:
        ${song.content}`,
      });
      
      let cleaned = response.text.trim();
      // Remove markdown code blocks if present
      cleaned = cleaned.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
      
      setSong({ ...song, content: cleaned });
    } catch (err) {
      console.error(err);
      alert('Failed to clean content. Please try again.');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 md:px-6 pt-4 pb-24 max-w-6xl mx-auto w-full"
    >
      <header className="w-full top-0 sticky z-50 bg-background border-none shadow-none flex justify-between items-center py-3 md:py-4 mb-6 md:mb-8">
        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => { onCancel(); navigate(-1); }} className="text-primary hover:bg-surface-container-highest transition-colors duration-200 p-1.5 md:p-2 rounded-xl active:scale-95 transition-transform">
            <Icon name="close" />
          </button>
          <h1 className="text-primary font-black tracking-tighter text-lg md:text-xl font-headline">
            {initialSong ? t.edit_song : t.new_song}
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={handleCleanContent}
            disabled={isCleaning || !song.content}
            className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-secondary/10 text-secondary rounded-xl font-label text-[10px] md:text-xs font-bold uppercase tracking-widest hover:bg-secondary/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {isCleaning ? (
              <div className="w-3 h-3 md:w-4 md:h-4 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin" />
            ) : (
              <Icon name="auto_fix_high" className="text-xs md:text-sm" />
            )}
            <span className="hidden sm:inline">{t.clean_ai}</span>
            <span className="sm:hidden">AI</span>
          </button>
          <button 
            onClick={handleSave}
            className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-4 md:px-6 py-1.5 md:py-2 rounded-xl font-bold tracking-tight text-sm md:text-base active:scale-95 transition-all shadow-lg shadow-primary/10"
          >
            {t.save.toUpperCase()}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <aside className="lg:col-span-4 space-y-4 md:space-y-6">
          <section className="bg-surface-container-low p-5 md:p-6 rounded-2xl space-y-4 md:space-y-6 border border-outline-variant/10">
            <header className="flex items-center justify-between mb-1 md:mb-2">
              <h2 className="font-label text-[10px] md:text-xs uppercase tracking-[0.2em] text-on-surface-variant font-semibold">{t.song_metadata}</h2>
              <Icon name="info" className="text-primary text-xs md:text-sm" />
            </header>
            <div className="space-y-3 md:space-y-4">
              <div className="group relative">
                <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">{t.song_title}</label>
                <div className="relative">
                  <input 
                    className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-primary rounded-lg p-2.5 md:p-3 text-on-surface font-headline font-bold text-base md:text-lg placeholder:text-on-surface-variant/30 transition-all" 
                    placeholder={t.enter_song_title} 
                    type="text"
                    value={song.title}
                    onChange={(e) => setSong({ ...song, title: e.target.value })}
                  />
                </div>
              </div>
              <div className="group">
                <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">{t.artist_composer}</label>
                <input 
                  className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-primary rounded-lg p-2.5 md:p-3 text-on-surface font-body text-sm md:text-base placeholder:text-on-surface-variant/30 transition-all" 
                  placeholder={t.artist_name} 
                  type="text"
                  value={song.artist}
                  onChange={(e) => setSong({ ...song, artist: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 md:gap-4 pt-1 md:pt-2">
                <div>
                  <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-secondary mb-1 ml-1">{t.key}</label>
                  <div className="relative">
                    <select 
                      className="w-full appearance-none bg-surface-container-highest border-none focus:ring-1 focus:ring-primary rounded-lg p-2.5 md:p-3 text-on-surface font-label font-medium text-xs md:text-sm pr-8 md:pr-10"
                      value={song.key}
                      onChange={(e) => setSong({ ...song, key: e.target.value })}
                    >
                      {['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'].map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                    <Icon name="unfold_more" className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-xs md:text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-primary mb-1 ml-1">{t.bpm}</label>
                  <input 
                    className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-primary rounded-lg p-2.5 md:p-3 text-on-surface font-label font-medium text-xs md:text-sm placeholder:text-on-surface-variant/30" 
                    placeholder="120" 
                    type="number"
                    value={song.bpm}
                    onChange={(e) => setSong({ ...song, bpm: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="group">
                <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">{t.capo_position} ({t.fret})</label>
                <input 
                  className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-primary rounded-lg p-2.5 md:p-3 text-on-surface font-label font-medium text-xs md:text-sm placeholder:text-on-surface-variant/30" 
                  placeholder="0" 
                  type="number"
                  min="0"
                  max="12"
                  value={song.capo || 0}
                  onChange={(e) => setSong({ ...song, capo: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="group">
                <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">{t.cover_url}</label>
                <input 
                  className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-primary rounded-lg p-2.5 md:p-3 text-on-surface font-body text-xs md:text-sm placeholder:text-on-surface-variant/30 transition-all" 
                  placeholder="https://example.com/image.jpg" 
                  type="text"
                  value={song.coverUrl || ''}
                  onChange={(e) => setSong({ ...song, coverUrl: e.target.value })}
                />
              </div>
              <div className="group">
                <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-[#FF0000] mb-1 ml-1 font-semibold">{t.youtube_url}</label>
                <div className="relative">
                  <input 
                    className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-[#FF0000] rounded-lg p-2.5 md:p-3 text-on-surface font-body text-xs md:text-sm placeholder:text-on-surface-variant/30 pr-10 transition-all" 
                    placeholder="https://www.youtube.com/watch?v=..." 
                    type="text"
                    value={song.youtubeUrl || ''}
                    onChange={(e) => setSong({ ...song, youtubeUrl: e.target.value })}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#FF0000] pointer-events-none">
                    <Icon name="smart_display" className="text-lg" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </aside>

        <article className="lg:col-span-8 space-y-4">
          <div className="bg-surface-container-low rounded-2xl flex flex-col min-h-[400px] md:min-h-[618px] border border-outline-variant/10 overflow-hidden">
            <nav className="p-1.5 md:p-2 border-b border-outline-variant/10 flex items-center gap-0.5 md:gap-1 bg-surface-container-low/80 backdrop-blur-md sticky top-0 z-20 overflow-x-auto no-scrollbar">
              <button className="p-1.5 md:p-2 hover:bg-surface-container-highest rounded-lg text-on-surface-variant hover:text-primary transition-colors flex-shrink-0">
                <Icon name="format_bold" className="text-sm md:text-base" />
              </button>
              <button className="p-1.5 md:p-2 hover:bg-surface-container-highest rounded-lg text-on-surface-variant hover:text-primary transition-colors flex-shrink-0">
                <Icon name="format_italic" className="text-sm md:text-base" />
              </button>
              <div className="h-5 md:h-6 w-[1px] bg-outline-variant/30 mx-0.5 md:mx-1 flex-shrink-0"></div>
              <button className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-surface-container-highest hover:bg-primary/10 rounded-lg text-primary transition-all border border-primary/20 flex-shrink-0">
                <Icon name="add_box" className="text-xs md:text-sm fill-1" />
                <span className="font-label text-[9px] md:text-xs font-bold uppercase tracking-wider">{t.chord}</span>
              </button>
              <button className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 hover:bg-surface-container-highest rounded-lg text-on-surface-variant transition-all flex-shrink-0">
                <Icon name="text_snippet" className="text-xs md:text-sm" />
                <span className="font-label text-[9px] md:text-xs font-bold uppercase tracking-wider">{t.section}</span>
              </button>
              <div className="h-5 md:h-6 w-[1px] bg-outline-variant/30 mx-2 md:mx-4 flex-shrink-0"></div>
              <div className="flex items-center gap-1 md:gap-2">
                <button 
                  onClick={() => setActiveTab('content')}
                  className={cn(
                    "px-3 md:px-4 py-1 md:py-1.5 rounded-lg font-label text-[9px] md:text-xs font-bold uppercase tracking-widest transition-all",
                    activeTab === 'content' ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-highest"
                  )}
                >
                  {t.content}
                </button>
                <button 
                  onClick={() => setActiveTab('sheet')}
                  className={cn(
                    "px-3 md:px-4 py-1 md:py-1.5 rounded-lg font-label text-[9px] md:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 md:gap-2",
                    activeTab === 'sheet' ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-highest"
                  )}
                >
                  <Icon name="description" className="text-[10px] md:text-xs" />
                  {t.view_sheet_music}
                </button>
              </div>
              <div className="flex-grow"></div>
              <button className="p-1.5 md:p-2 hover:bg-surface-container-highest rounded-lg text-on-surface-variant transition-colors flex-shrink-0" title="Full Screen">
                <Icon name="fullscreen" className="text-sm md:text-base" />
              </button>
            </nav>
            <div className="relative flex-grow p-4 md:p-8">
              {activeTab === 'content' ? (
                <>
                  <textarea 
                    className="w-full h-full bg-transparent border-none focus:ring-0 text-on-surface-variant font-mono text-sm md:text-base leading-relaxed resize-none placeholder:text-on-surface-variant/20 min-h-[300px]" 
                    placeholder={t.lyrics_placeholder} 
                    value={song.content}
                    onChange={(e) => setSong({ ...song, content: e.target.value })}
                  ></textarea>
                  <div className="hidden sm:block absolute bottom-6 right-6 p-4 rounded-xl bg-surface-container-highest/80 backdrop-blur-md border border-outline-variant/10 max-w-xs shadow-2xl">
                    <div className="flex items-start gap-3">
                      <Icon name="lightbulb" className="text-primary" />
                      <div>
                        <h4 className="text-xs font-bold font-label uppercase text-on-surface">{t.pro_tip}</h4>
                        <p className="text-xs text-on-surface-variant leading-snug mt-1">{t.pro_tip_desc}</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full h-full min-h-[500px] flex flex-col gap-4">
                  {song.pdfSheetMusicUrl ? (
                    <div className="flex-grow relative rounded-xl overflow-hidden border border-outline-variant/20">
                      <PDFViewer url={song.pdfSheetMusicUrl} title={song.title} language={language} />
                      <button 
                        onClick={() => setSong({ ...song, pdfSheetMusicUrl: undefined })}
                        className="absolute top-4 left-4 bg-error/90 text-on-error px-3 py-1.5 rounded-lg font-label text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-error transition-all"
                      >
                        {t.delete_song}
                      </button>
                    </div>
                  ) : (
                    <div className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-highest/30 p-12 text-center">
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
                        <Icon name="upload_file" className="text-3xl" />
                      </div>
                      <h4 className="text-on-surface font-headline font-bold text-lg mb-2">{t.import_sheet_music}</h4>
                      <p className="text-on-surface-variant text-sm max-w-xs mb-6">{t.import_sheet_music_desc}</p>
                      <label className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-label text-xs font-bold uppercase tracking-widest cursor-pointer hover:shadow-lg transition-all active:scale-95">
                        {t.import}
                        <input 
                          type="file" 
                          accept="application/pdf" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setSong({ ...song, pdfSheetMusicUrl: reader.result as string });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
            <footer className="px-4 md:px-6 py-2 md:py-3 bg-surface-container-lowest/50 flex justify-between items-center border-t border-outline-variant/5">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                  <span className="font-label text-[9px] md:text-xs uppercase tracking-widest text-on-surface-variant">{t.live_sync}</span>
                </div>
                <span className="font-label text-[9px] md:text-xs uppercase tracking-widest text-on-surface-variant/40">{song.content.split(/\s+/).filter(Boolean).length} {t.words}</span>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                <button className="p-1 md:p-1.5 hover:bg-surface-container-highest rounded-md transition-colors">
                  <Icon name="undo" className="text-xs md:text-sm text-on-surface-variant" />
                </button>
                <button className="p-1 md:p-1.5 hover:bg-surface-container-highest rounded-md transition-colors">
                  <Icon name="redo" className="text-xs md:text-sm text-on-surface-variant" />
                </button>
              </div>
            </footer>
          </div>
        </article>
      </div>
    </motion.div>
  );
};

const SetlistsView = ({ songs, setlists, onDeleteSetlist, activeSetlistId, setActiveSetlistId, onToggleSidebar, language }: { songs: Song[], setlists: Setlist[], onDeleteSetlist: (id: string) => void, activeSetlistId: string | null, setActiveSetlistId: (id: string | null) => void, onToggleSidebar: () => void, language: Language }) => {
  const navigate = useNavigate();
  const t = useTranslation(language);
  const [expandedSetlistId, setExpandedSetlistId] = useState<string | null>(null);
  
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const calculateTotalDuration = (songIds: string[]) => {
    const totalSeconds = songIds.reduce((acc, id) => {
      const song = songs.find(s => s.id === id);
      return acc + (song?.duration || 0);
    }, 0);
    return formatDuration(totalSeconds);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 md:px-6 pt-6 md:pt-8 pb-40 max-w-5xl mx-auto w-full"
    >
      <header className="flex justify-between items-center mb-8 md:mb-12">
        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={onToggleSidebar}
            className="text-primary hover:bg-surface-container-highest p-1.5 md:p-2 rounded-lg transition-colors active:scale-90"
          >
            <Icon name="menu" />
          </button>
          <h1 className="text-primary font-black tracking-tighter text-2xl md:text-3xl font-headline">{t.setlists}</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={() => navigate('/setlists/new')}
            className="bg-primary/10 text-primary px-4 py-2 rounded-xl font-label text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-primary/20 transition-all active:scale-95"
          >
            <Icon name="add" className="text-sm" />
            <span className="hidden sm:inline">{t.new_setlist}</span>
            <span className="sm:hidden">NEW</span>
          </button>
          <button 
            onClick={() => navigate('/profile')}
            className="text-primary hover:bg-surface-container-highest p-1.5 md:p-2 rounded-lg transition-colors active:scale-90"
          >
            <Icon name="account_circle" className="text-2xl md:text-3xl" />
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-label text-on-surface-variant text-xs md:text-sm font-bold tracking-widest uppercase">{t.collections}</h3>
          <div className="h-px bg-outline-variant/30 flex-grow mx-4"></div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:gap-6">
          {setlists.map((set) => {
            const isExpanded = expandedSetlistId === set.id;
            const setSongs = set.songs.map(id => songs.find(s => s.id === id)).filter(Boolean) as Song[];
            
            return (
              <div 
                key={set.id} 
                className={cn(
                  "rounded-3xl transition-all border border-outline-variant/10 overflow-hidden shadow-sm",
                  isExpanded ? "bg-surface-container shadow-lg ring-1 ring-primary/20" : "bg-surface-container-low hover:bg-surface-container"
                )}
              >
                {/* Setlist Header */}
                <div 
                  onClick={() => setExpandedSetlistId(isExpanded ? null : set.id)}
                  className="p-4 md:p-6 cursor-pointer flex items-center gap-4 md:gap-6"
                >
                  <div className={cn(
                    "w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center transition-all",
                    isExpanded ? "bg-primary text-on-primary shadow-lg scale-110" : "bg-surface-container-highest text-primary"
                  )}>
                    <Icon name={set.type === 'rehearsal' ? 'church' : 'stadium'} className="text-2xl md:text-3xl" />
                  </div>
                  
                  <div className="flex-grow min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <h5 className="font-headline font-black text-lg md:text-2xl text-on-surface leading-tight">{set.name}</h5>
                      {set.type && (
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[8px] md:text-[10px] font-label font-black uppercase tracking-widest mt-1.5 md:mt-2.5">
                          {set.type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 md:gap-4 text-on-surface-variant/60 font-label text-[10px] md:text-xs font-medium">
                      <span className="flex items-center gap-1">
                        <Icon name="music_note" className="text-[12px]" />
                        {set.songs.length} {t.songs}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="schedule" className="text-[12px]" />
                        {calculateTotalDuration(set.songs)}
                      </span>
                      <span className="hidden sm:flex items-center gap-1">
                        <Icon name="event" className="text-[12px]" />
                        {set.upcomingDate || set.lastModified}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/perform/setlist/${set.id}/0`);
                      }}
                      className="w-10 h-10 md:w-12 md:h-12 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg hover:shadow-primary/20 hover:scale-110 transition-all active:scale-95"
                      title={t.go_live}
                    >
                      <Icon name="play_arrow" className="fill-1 text-xl md:text-2xl" />
                    </button>
                    <div className="hidden sm:flex flex-col gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/setlists/edit/${set.id}`);
                        }}
                        className="p-2 hover:bg-surface-container-highest rounded-lg text-on-surface-variant transition-colors"
                      >
                        <Icon name="edit" className="text-sm" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(t.confirm_delete_setlist)) onDeleteSetlist(set.id);
                        }}
                        className="p-2 hover:bg-error/10 hover:text-error rounded-lg transition-colors"
                      >
                        <Icon name="delete" className="text-sm" />
                      </button>
                    </div>
                    <Icon 
                      name={isExpanded ? "expand_less" : "expand_more"} 
                      className={cn("text-on-surface-variant transition-transform duration-300 ml-2", isExpanded ? "rotate-0" : "rotate-0")} 
                    />
                  </div>
                </div>

                {/* Embedded Songs List */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="border-t border-outline-variant/10 bg-surface-container-lowest/30"
                    >
                      <div className="p-4 md:p-6 pt-2 md:pt-2 space-y-2">
                        <div className="flex items-center justify-between mb-4 px-2">
                          <span className="font-label text-[10px] md:text-xs font-bold text-on-surface-variant uppercase tracking-widest">{t.setlist_queue}</span>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => navigate(`/setlists/edit/${set.id}`)}
                              className="sm:hidden p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-lg"
                            >
                              <Icon name="edit" className="text-sm" />
                            </button>
                            <button 
                              onClick={() => {
                                if (confirm(t.confirm_delete_setlist)) onDeleteSetlist(set.id);
                              }}
                              className="sm:hidden p-2 text-on-surface-variant hover:bg-error/10 hover:text-error rounded-lg"
                            >
                              <Icon name="delete" className="text-sm" />
                            </button>
                          </div>
                        </div>
                        
                        {setSongs.length > 0 ? setSongs.map((song, index) => (
                          <div 
                            key={song.id} 
                            onClick={() => navigate(`/perform/setlist/${set.id}/${index}`)}
                            className="p-2 md:p-3 rounded-xl flex items-center gap-3 md:gap-4 bg-surface-container-low/50 hover:bg-surface-container transition-all cursor-pointer group"
                          >
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-surface-container-highest text-on-surface-variant flex items-center justify-center font-label font-bold text-xs md:text-sm group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                              {String(index + 1).padStart(2, '0')}
                            </div>
                            <div className="flex-grow min-w-0">
                              <div className="flex items-center gap-2">
                                <h6 className="font-headline font-bold text-on-surface text-sm md:text-base truncate">{song.title}</h6>
                                <span className="bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded text-[8px] md:text-[10px] font-label font-bold">{song.key}</span>
                              </div>
                              <p className="text-on-surface-variant text-[10px] md:text-xs font-label opacity-70">{song.artist}</p>
                            </div>
                            <div className="text-on-surface-variant font-label text-[10px] md:text-xs font-medium px-2">{formatDuration(song.duration || 0)}</div>
                            <Icon name="play_circle" className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )) : (
                          <div className="py-8 text-center text-on-surface-variant/40 italic text-sm">
                            {t.no_songs_in_setlist}
                          </div>
                        )}
                        
                        <button 
                          onClick={() => navigate(`/setlists/edit/${set.id}`)}
                          className="w-full py-3 border-2 border-dashed border-outline-variant/20 rounded-xl flex items-center justify-center gap-2 text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all font-label text-xs uppercase tracking-widest mt-4"
                        >
                          <Icon name="add" className="text-sm" />
                          {t.add_song_to_setlist}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 gap-4 mt-8">
          <div className="bg-surface-container-low p-4 md:p-6 rounded-3xl flex flex-col items-center justify-center text-center border border-outline-variant/10">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-3">
              <Icon name="auto_stories" className="text-xl md:text-2xl" />
            </div>
            <span className="font-headline font-black text-2xl md:text-4xl text-on-surface">{songs.length}</span>
            <span className="font-label text-[10px] md:text-xs text-on-surface-variant uppercase tracking-widest font-bold">{t.repertoire}</span>
          </div>
          <div className="bg-surface-container-low p-4 md:p-6 rounded-3xl flex flex-col items-center justify-center text-center border border-outline-variant/10">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-secondary/10 rounded-full flex items-center justify-center text-secondary mb-3">
              <Icon name="history" className="text-xl md:text-2xl" />
            </div>
            <span className="font-headline font-black text-2xl md:text-4xl text-on-surface">38</span>
            <span className="font-label text-[10px] md:text-xs text-on-surface-variant uppercase tracking-widest font-bold">{t.past_gigs}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const PDFViewer = ({ url, title, language }: { url: string, title: string, language: Language }) => {
  const t = useTranslation(language);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (url.startsWith('data:application/pdf;base64,')) {
      try {
        const base64 = url.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const newUrl = URL.createObjectURL(blob);
        setObjectUrl(newUrl);
        return () => URL.revokeObjectURL(newUrl);
      } catch (err) {
        console.error('Error creating object URL:', err);
        setObjectUrl(url);
      }
    } else {
      setObjectUrl(url);
    }
  }, [url]);

  if (!objectUrl) {
    return (
      <div className="w-full h-[calc(100vh-280px)] bg-surface-container-low rounded-3xl flex items-center justify-center text-on-surface-variant/30 italic">
        {t.importing}
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-280px)] bg-surface-container-low rounded-3xl overflow-hidden shadow-2xl border border-outline-variant/10 relative">
      <iframe 
        src={`${objectUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
        className="w-full h-full border-none"
        title={title}
      />
      <div className="absolute top-4 right-4 flex gap-2">
        <a 
          href={objectUrl} 
          download={`${title}.pdf`}
          className="w-10 h-10 bg-surface-bright/80 backdrop-blur-md rounded-full flex items-center justify-center text-primary shadow-lg hover:bg-surface-bright transition-all active:scale-90"
          title="Download"
        >
          <Icon name="download" className="text-sm" />
        </a>
        <button 
          onClick={() => window.open(objectUrl, '_blank')}
          className="w-10 h-10 bg-surface-bright/80 backdrop-blur-md rounded-full flex items-center justify-center text-primary shadow-lg hover:bg-surface-bright transition-all active:scale-90"
          title="Open in new tab"
        >
          <Icon name="open_in_new" className="text-sm" />
        </button>
      </div>
    </div>
  );
};

const getYoutubeVideoId = (url?: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

const PerformView = ({ songs, setlists, settings, onUpdateSettings, onUpdateSong, language }: { songs: Song[], setlists: Setlist[], settings: PerformanceSettings, onUpdateSettings: (s: PerformanceSettings) => void, onUpdateSong: (s: Song) => void, language: Language }) => {
  const { id, setlistId, songIndex } = useParams();
  const navigate = useNavigate();
  const t = useTranslation(language);
  const [transpose, setTranspose] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1); // 1 is baseline
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [beat, setBeat] = useState(0);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [justTapped, setJustTapped] = useState(false);
  const [viewMode, setViewMode] = useState<'chords' | 'sheet'>('chords');
  const [activeYoutubeId, setActiveYoutubeId] = useState<string | null>(null);
  const [isYoutubeHidden, setIsYoutubeHidden] = useState(true);
  const ytPlayerRef = useRef<any>(null);
  const [isYoutubePlaying, setIsYoutubePlaying] = useState(false);
  const [youtubeCurrentTime, setYoutubeCurrentTime] = useState(0);
  const [youtubeTotalDuration, setYoutubeTotalDuration] = useState(0);

  // Preload YouTube Iframe Player API script once on mount
  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }, []);

  useEffect(() => {
    if (!activeYoutubeId) {
      setIsYoutubePlaying(false);
      setYoutubeCurrentTime(0);
      setYoutubeTotalDuration(0);
      ytPlayerRef.current = null;
      return;
    }

    let checkInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    let player: any = null;

    const setupPlayer = () => {
      const iframeId = 'youtube-iframe-player';
      const el = document.getElementById(iframeId);
      if (!el) {
        // If the iframe isn't in DOM yet, retry soon
        setTimeout(setupPlayer, 100);
        return;
      }

      try {
        player = new (window as any).YT.Player(iframeId, {
          events: {
            onReady: () => {
              ytPlayerRef.current = player;
              setYoutubeTotalDuration(player.getDuration() || 0);
              setIsYoutubePlaying(true);
              try {
                player.playVideo();
              } catch (e) {
                console.error("Autoplay failed onReady:", e);
              }
            },
            onStateChange: (event: any) => {
              if (event.data === (window as any).YT.PlayerState.PLAYING) {
                setIsYoutubePlaying(true);
                const dur = player.getDuration();
                if (dur && dur > 0) {
                  setYoutubeTotalDuration(dur);
                }
              } else if (event.data === (window as any).YT.PlayerState.PAUSED) {
                setIsYoutubePlaying(false);
              } else if (event.data === (window as any).YT.PlayerState.ENDED) {
                setIsYoutubePlaying(false);
              }
            }
          }
        });
      } catch (err) {
        console.error("Error creating YT Player over existing iframe:", err);
      }
    };

    if ((window as any).YT && (window as any).YT.Player) {
      setupPlayer();
    } else {
      checkInterval = setInterval(() => {
        if ((window as any).YT && (window as any).YT.Player) {
          if (checkInterval) clearInterval(checkInterval);
          setupPlayer();
        }
      }, 100);
    }

    progressInterval = setInterval(() => {
      const activePlayer = player || ytPlayerRef.current;
      if (activePlayer && typeof activePlayer.getCurrentTime === 'function') {
        try {
          const current = activePlayer.getCurrentTime();
          setYoutubeCurrentTime(current || 0);
          const duration = activePlayer.getDuration();
          if (duration && duration > 0) {
            setYoutubeTotalDuration(duration);
          }
        } catch (e) {}
      }
    }, 500);

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (progressInterval) clearInterval(progressInterval);
      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy();
        } catch (e) {}
      }
      ytPlayerRef.current = null;
    };
  }, [activeYoutubeId]);

  const currentTheme = useMemo(() => {
    if (settings.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return settings.theme;
  }, [settings.theme]);

  const effectiveColors = useMemo(() => {
    if (currentTheme === 'light') {
      // Light Mode: Lyrics are black
      const lyricColor = '#000000';
      
      // Chord Color Logic: If near-white in dark mode, change to black.
      const isNearWhite = (color: string) => {
        const hex = color.replace('#', '');
        if (hex.length !== 6) return false;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 200;
      };

      const chordColor = isNearWhite(settings.chordColor) ? '#000000' : settings.chordColor;
      
      return { lyricColor, chordColor };
    } else {
      // Dark Mode: Use settings
      return { 
        lyricColor: settings.lyricColor, 
        chordColor: settings.chordColor 
      };
    }
  }, [currentTheme, settings.lyricColor, settings.chordColor]);

  const handleTapTempo = () => {
    const now = Date.now();
    const lastTap = tapTimes[tapTimes.length - 1];
    
    // Reset if more than 2s passed or if we just finished a set of 4
    const shouldReset = (lastTap && now - lastTap > 2000);
    const newTapTimes = shouldReset ? [now] : [...tapTimes, now].slice(-4);
    
    setTapTimes(newTapTimes);

    if (newTapTimes.length === 4) {
      const intervals = [];
      for (let i = 1; i < newTapTimes.length; i++) {
        intervals.push(newTapTimes[i] - newTapTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = Math.round(60000 / avgInterval);
      if (newBpm >= 40 && newBpm <= 250) {
        onUpdateSong({ ...song, bpm: newBpm });
        setJustTapped(true);
        setTimeout(() => setJustTapped(false), 1500);
      }
    }
  };

  // Sort songs alphabetically for consistent navigation
  const sortedSongs = useMemo(() => [...songs].sort((a, b) => a.title.localeCompare(b.title)), [songs]);

  // Determine current song and setlist context
  let currentSong: Song | undefined;
  let currentSetlist: Setlist | undefined;
  let currentIndex = -1;

  if (setlistId && songIndex !== undefined) {
    currentSetlist = setlists.find(s => s.id === setlistId);
    if (currentSetlist) {
      currentIndex = parseInt(songIndex);
      const songId = currentSetlist.songs[currentIndex];
      currentSong = songs.find(s => s.id === songId);
    }
  } else {
    currentSong = sortedSongs.find(s => s.id === id) || sortedSongs[0];
    if (currentSong) {
      currentIndex = sortedSongs.findIndex(s => s.id === currentSong?.id);
    }
  }

  const song = currentSong || sortedSongs[0];

  useEffect(() => {
    if (song.pdfSheetMusicUrl && !song.content) {
      setViewMode('sheet');
    } else {
      setViewMode('chords');
    }
    setActiveYoutubeId(null);
  }, [song.id]);
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isScrolling) {
      interval = setInterval(() => {
        window.scrollBy({
          top: scrollSpeed,
          behavior: 'auto'
        });
      }, 50); // ~20fps for smooth scroll
    }
    return () => clearInterval(interval);
  }, [isScrolling, scrollSpeed]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isMetronomeActive && song.bpm) {
      const msPerBeat = (60 / song.bpm) * 1000;
      interval = setInterval(() => {
        setBeat(prev => (prev + 1) % 4);
      }, msPerBeat);
    } else {
      setBeat(0);
    }
    return () => clearInterval(interval);
  }, [isMetronomeActive, song.bpm]);

  const isAnyStreamingConnected = useMemo(() => {
    return settings.streamingAccounts?.some(a => a.connected);
  }, [settings.streamingAccounts]);

  if (!song) return <div className="p-8 text-center">No song selected</div>;

  const toggleScroll = () => setIsScrolling(!isScrolling);
  const cycleSpeed = () => {
    const speeds = [0.5, 1, 1.5, 2, 3];
    const currentIndex = speeds.indexOf(scrollSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setScrollSpeed(speeds[nextIndex]);
  };

  const cycleFontSize = () => {
    const sizes = [20, 28, 36, 44, 52];
    const currentIdx = sizes.indexOf(settings.fontSize);
    const nextIdx = (currentIdx + 1) % sizes.length;
    onUpdateSettings({ ...settings, fontSize: sizes[nextIdx] });
  };

  const toggleFocusMode = () => setIsFocusMode(!isFocusMode);

  const setCapo = (val: number) => {
    if (song) {
      onUpdateSong({ ...song, capo: val });
    }
  };

  const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  const setKeyDirectly = (targetKey: string) => {
    const originalKey = song.key.replace(/[#b]/g, (match, offset, string) => {
      // Simple check for sharp/flat
      return match;
    }).split(/[m\s]/)[0]; // Get root note
    
    const targetRoot = targetKey.split(/[m\s]/)[0];
    
    let originalIndex = CHROMATIC.indexOf(originalKey);
    if (originalIndex === -1) originalIndex = FLATS.indexOf(originalKey);
    
    let targetIndex = CHROMATIC.indexOf(targetRoot);
    if (targetIndex === -1) targetIndex = FLATS.indexOf(targetRoot);
    
    if (originalIndex !== -1 && targetIndex !== -1) {
      let diff = targetIndex - originalIndex;
      setTranspose(diff);
    }
  };

  const goToNext = () => {
    if (currentSetlist && currentIndex < currentSetlist.songs.length - 1) {
      navigate(`/perform/setlist/${setlistId}/${currentIndex + 1}`);
      window.scrollTo(0, 0);
      setTranspose(0);
      setIsScrolling(false);
    } else if (!currentSetlist && currentIndex < sortedSongs.length - 1) {
      navigate(`/perform/${sortedSongs[currentIndex + 1].id}`);
      window.scrollTo(0, 0);
      setTranspose(0);
      setIsScrolling(false);
    }
  };

  const goToPrev = () => {
    if (currentSetlist && currentIndex > 0) {
      navigate(`/perform/setlist/${setlistId}/${currentIndex - 1}`);
      window.scrollTo(0, 0);
      setTranspose(0);
      setIsScrolling(false);
    } else if (!currentSetlist && currentIndex > 0) {
      navigate(`/perform/${sortedSongs[currentIndex - 1].id}`);
      window.scrollTo(0, 0);
      setTranspose(0);
      setIsScrolling(false);
    }
  };

  const handleDragEnd = (_: any, info: any) => {
    const threshold = 100;
    if (info.offset.x < -threshold) {
      goToNext();
    } else if (info.offset.x > threshold) {
      goToPrev();
    }
  };

  const transposeChord = (chord: string, semitones: number) => {
    if (semitones === 0) return chord;
    
    const transposeNote = (note: string) => {
      let index = CHROMATIC.indexOf(note);
      if (index === -1) index = FLATS.indexOf(note);
      if (index === -1) return note;
      let newIndex = (index + semitones) % 12;
      if (newIndex < 0) newIndex += 12;
      
      // Heuristic for choosing between sharp and flat
      const useFlats = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(CHROMATIC[newIndex]) || note.includes('b');
      return useFlats ? FLATS[newIndex] : CHROMATIC[newIndex];
    };

    return chord.replace(/[A-G][#b]?/g, transposeNote);
  };

  const currentKey = transposeChord(song.key, transpose);
  const chordTransposeAmount = transpose - (settings.autoTranspose ? (song.capo || 0) : 0);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      className="min-h-screen bg-background touch-none"
    >
      {/* Visual Click Indicator - Subtle Screen Glow synchronized with beat */}
      {settings.visualClick && isMetronomeActive && (
        <motion.div 
          key={`${song.id}-${isMetronomeActive}-${beat}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.12, 0] }}
          transition={{ 
            duration: (60 / (song.bpm || 120)) * 0.5, 
            ease: "easeOut"
          }}
          className="fixed inset-0 bg-primary pointer-events-none z-[100]"
        />
      )}

      {!isFocusMode && (
        <header className="w-full top-0 sticky bg-background z-50 border-b border-outline-variant/10">
          <div className="w-full h-1 bg-surface-container-highest">
            <div 
              className="h-full bg-primary transition-all duration-500" 
              style={{ width: `${((currentIndex + 1) / (currentSetlist ? currentSetlist.songs.length : sortedSongs.length)) * 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center px-2 md:px-6 py-2 md:py-4 w-full">
            <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
              <Link to={currentSetlist ? "/setlists" : "/"} className="text-on-surface-variant hover:bg-surface-container-highest p-1 md:p-2 rounded-full transition-colors flex-shrink-0">
                <Icon name="arrow_back" />
              </Link>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <h1 className="text-primary font-black tracking-tighter text-sm md:text-xl font-headline truncate">{song.title}</h1>
                  <span className="font-label text-[7px] md:text-[10px] bg-primary/10 text-primary px-1 md:px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap">
                    {currentIndex + 1} / {currentSetlist ? currentSetlist.songs.length : sortedSongs.length}
                  </span>
                </div>
                <p className="font-label text-[7px] md:text-[10px] uppercase tracking-widest text-on-surface-variant truncate">
                  {song.artist} • <span className="text-primary font-bold">{currentKey}</span> {transpose !== 0 && <span className="opacity-50">({song.key})</span>} {settings.autoTranspose && song.capo && song.capo > 0 && <span className="text-secondary font-bold ml-1">{t.auto_t}</span>} • {song.bpm} BPM
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 md:gap-2">
            <div className="flex items-center gap-1.5 md:gap-2 mr-2">
              {song.youtubeUrl && (
                <button 
                  onClick={() => {
                    const ytId = getYoutubeVideoId(song.youtubeUrl);
                    if (ytId) {
                      setActiveYoutubeId(ytId);
                      setIsYoutubeHidden(true); // default to only background music as requested
                      toast.success(language === 'pt-BR' || language === 'pt-PT'
                        ? "Áudio do YouTube ativado!"
                        : "YouTube background audio player loaded!"
                      );
                    } else {
                      window.open(song.youtubeUrl, '_blank');
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 active:scale-95 transition-all text-[8px] md:text-[10px] font-bold uppercase tracking-widest border border-red-500/10"
                  title={t.play_on_youtube}
                >
                  <Icon name="smart_display" className="text-xs md:text-sm" />
                  <span>YouTube</span>
                </button>
              )}
            </div>
              <div className="flex items-center gap-1 md:gap-2 mr-2 md:mr-4">
                <button 
                  onClick={goToPrev}
                  disabled={currentIndex === 0}
                  className="p-1.5 md:p-2 text-on-surface-variant hover:text-primary disabled:opacity-20 active:scale-90 transition-all"
                >
                  <Icon name="chevron_left" className="text-xl md:text-2xl" />
                </button>
                <button 
                  onClick={goToNext}
                  disabled={currentIndex === (currentSetlist ? currentSetlist.songs.length - 1 : sortedSongs.length - 1)}
                  className="p-1.5 md:p-2 text-on-surface-variant hover:text-primary disabled:opacity-20 active:scale-90 transition-all"
                >
                  <Icon name="chevron_right" className="text-xl md:text-2xl" />
                </button>
              </div>
              <button className="text-on-surface-variant hover:bg-surface-container-highest p-1.5 md:p-2 rounded-full transition-colors">
                <Icon name="favorite" className="text-lg md:text-xl" />
              </button>
              <div className="relative">
                <button 
                  onClick={() => {
                    setIsMenuOpen(!isMenuOpen);
                    if (isMenuOpen) {
                      setTapTimes([]);
                      setJustTapped(false);
                    }
                  }}
                  className={cn(
                    "p-1.5 md:p-2 rounded-full transition-all",
                    isMenuOpen ? "bg-primary text-on-primary shadow-lg" : "text-on-surface-variant hover:bg-surface-container-highest"
                  )}
                >
                  <Icon name="more_vert" className="text-lg md:text-xl" />
                </button>
                
                <AnimatePresence>
                  {isMenuOpen && (
                    <>
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => {
                          setIsMenuOpen(false);
                          setTapTimes([]);
                          setJustTapped(false);
                        }}
                        className="fixed inset-0 z-[60]"
                      />
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 10, x: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10, x: 20 }}
                        className="absolute right-0 mt-4 w-56 md:w-72 bg-surface-container-highest border border-outline-variant/20 rounded-3xl shadow-2xl p-2.5 md:p-4 z-[70] space-y-3 md:space-y-6"
                      >
                        <div className="space-y-4">
                          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold px-2">{t.tone_transpose}</h3>
                          <div className="bg-surface-container-low/40 rounded-2xl p-2 md:p-3 border border-outline-variant/5">
                            <div className="flex items-center justify-between mb-4">
                              <div className="relative group/transpose">
                                <button className="flex items-center gap-2 px-4 py-2 bg-surface-bright rounded-xl transition-colors">
                                  <span className="font-headline font-black text-primary text-xl">{currentKey}</span>
                                  <Icon name="unfold_more" className="text-primary text-xs" />
                                </button>
                                <div className="absolute top-full left-0 mt-2 bg-surface-container-highest border border-outline-variant/20 rounded-2xl shadow-2xl p-2 hidden group-hover/transpose:grid grid-cols-4 gap-1 min-w-[200px] z-[80]">
                                  {CHROMATIC.map(k => {
                                    const currentRoot = currentKey.split(/[m\s]/)[0];
                                    return (
                                      <button 
                                        key={k}
                                        onClick={() => setKeyDirectly(k)}
                                        className={cn(
                                          "p-2 rounded-lg font-headline font-bold text-xs transition-all",
                                          currentRoot === k ? "bg-primary text-on-primary" : "hover:bg-surface-bright text-on-surface"
                                        )}
                                      >
                                        {k}
                                      </button>
                                    );
                                  })}
                                    <button 
                                      onClick={() => setTranspose(0)}
                                      className="col-span-4 mt-1 p-2 bg-surface-container-low hover:bg-surface-container-highest rounded-lg font-label text-[10px] uppercase tracking-widest text-secondary transition-all"
                                    >
                                      {t.reset_to} {song.key}
                                    </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => setTranspose(prev => prev - 1)}
                                  className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-bright hover:bg-surface-container-highest text-on-surface active:scale-90 transition-all"
                                >
                                  <Icon name="remove" className="text-sm" />
                                </button>
                                <div className="w-10 text-center font-headline font-black text-lg text-primary">{transpose > 0 ? `+${transpose}` : transpose}</div>
                                <button 
                                  onClick={() => setTranspose(prev => prev + 1)}
                                  className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-bright hover:bg-surface-container-highest text-on-surface active:scale-90 transition-all"
                                >
                                  <Icon name="add" className="text-sm" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold px-2">{t.capo_position}</h3>
                          <div className="bg-surface-container-low/40 rounded-2xl p-2 md:p-3 border border-outline-variant/5">
                            <div className="flex items-center justify-between">
                              <button 
                                onClick={() => setCapo(Math.max(0, (song.capo || 0) - 1))}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-bright hover:bg-surface-container-highest text-on-surface active:scale-90 transition-all"
                              >
                                <Icon name="remove" className="text-base" />
                              </button>
                              <div className="flex flex-col items-center">
                                <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant leading-none mb-1">{t.fret}</span>
                                <div className="font-headline font-black text-2xl text-primary leading-none">{(song.capo || 0)}</div>
                              </div>
                              <button 
                                onClick={() => setCapo(Math.min(12, (song.capo || 0) + 1))}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-bright hover:bg-surface-container-highest text-on-surface active:scale-90 transition-all"
                              >
                                <Icon name="add" className="text-base" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold px-2">{t.tempo_bpm}</h3>
                          <div className="bg-surface-container-low/40 rounded-2xl p-2 md:p-3 border border-outline-variant/5">
                            <div className="flex items-center justify-between">
                              <button 
                                onClick={() => onUpdateSong({ ...song, bpm: Math.max(40, (song.bpm || 120) - 1) })}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-bright hover:bg-surface-container-highest text-on-surface active:scale-90 transition-all"
                              >
                                <Icon name="remove" className="text-base" />
                              </button>
                              <div className="flex flex-col items-center">
                                <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant leading-none mb-1">{t.bpm}</span>
                                <div className="font-headline font-black text-2xl text-primary leading-none">{(song.bpm || 120)}</div>
                              </div>
                              <button 
                                onClick={() => onUpdateSong({ ...song, bpm: Math.min(250, (song.bpm || 120) + 1) })}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-bright hover:bg-surface-container-highest text-on-surface active:scale-90 transition-all"
                              >
                                <Icon name="add" className="text-base" />
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <motion.button 
                              whileTap={{ scale: 0.95 }}
                              onClick={handleTapTempo}
                              className={cn(
                                "flex-1 py-3 rounded-xl font-label text-[10px] uppercase tracking-[0.2em] font-black transition-all flex items-center justify-center gap-2",
                                justTapped ? "bg-green-500/20 text-green-500" : "bg-primary/10 hover:bg-primary/20 text-primary"
                              )}
                            >
                              <Icon name={justTapped ? "check" : "touch_app"} className="text-base" />
                              {justTapped ? t.bpm_updated : `${t.tap_tempo} ${tapTimes.length > 0 ? `(${tapTimes.length}/4)` : ""}`}
                            </motion.button>
                            {tapTimes.length > 0 && (
                              <button 
                                onClick={() => setTapTimes([])}
                                className="p-3 rounded-xl bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors"
                              >
                                <Icon name="restart_alt" className="text-base" />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className={cn("max-w-4xl mx-auto px-4 md:px-6 pb-32 select-none", isFocusMode ? "pt-12" : "pt-8")}>
        {!isFocusMode && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 text-on-surface-variant/60 font-label text-[10px] uppercase tracking-widest gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name={currentSetlist ? "list_music" : "library_music"} className="text-xs flex-shrink-0" />
              <span className="truncate">{currentSetlist ? currentSetlist.name : t.full_repertoire}</span>
            </div>
            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
              {currentIndex > 0 && (
                <button 
                  onClick={goToPrev}
                  className="flex items-center gap-1 hover:text-primary transition-colors min-w-0"
                >
                  <Icon name="arrow_back" className="text-[10px] flex-shrink-0" />
                  <span className="opacity-40 truncate max-w-[120px] md:max-w-[200px] lg:max-w-none">
                    {t.prev}: {currentSetlist ? songs.find(s => s.id === currentSetlist?.songs[currentIndex-1])?.title : sortedSongs[currentIndex-1].title}
                  </span>
                </button>
              )}
              {currentIndex < (currentSetlist ? currentSetlist.songs.length - 1 : sortedSongs.length - 1) && (
                <button 
                  onClick={goToNext}
                  className="flex items-center gap-1 hover:text-primary transition-colors min-w-0"
                >
                  <span className="text-primary/60 truncate max-w-[120px] md:max-w-[200px] lg:max-w-none">
                    {t.next}: {currentSetlist ? songs.find(s => s.id === currentSetlist?.songs[currentIndex+1])?.title : sortedSongs[currentIndex+1].title}
                  </span>
                  <Icon name="arrow_forward" className="text-[10px] text-primary/60 flex-shrink-0" />
                </button>
              )}
            </div>
          </div>
        )}
        {!isFocusMode && song.capo && song.capo > 0 && (
          <div className="flex flex-wrap gap-4 mb-12">
            <div className="bg-surface-container-low px-4 py-2 rounded-xl">
              <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block">{t.capo}</span>
              <span className="font-headline font-bold text-lg">{song.capo}{song.capo === 1 ? t.st : song.capo === 2 ? t.nd : song.capo === 3 ? t.rd : t.th} {t.fret}</span>
            </div>
          </div>
        )}

        {song.content && song.pdfSheetMusicUrl && (
          <div className="flex justify-center mb-8">
            <div className="bg-surface-container-highest p-1 rounded-2xl flex gap-1 shadow-lg border border-outline-variant/10">
              <button 
                onClick={() => setViewMode('chords')}
                className={cn(
                  "px-6 py-2.5 rounded-xl font-label text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  viewMode === 'chords' ? "bg-primary text-on-primary shadow-md" : "text-on-surface-variant hover:bg-surface-bright"
                )}
              >
                <Icon name="lyrics" className="text-sm" />
                {t.chords_lyrics}
              </button>
              <button 
                onClick={() => setViewMode('sheet')}
                className={cn(
                  "px-6 py-2.5 rounded-xl font-label text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  viewMode === 'sheet' ? "bg-primary text-on-primary shadow-md" : "text-on-surface-variant hover:bg-surface-bright"
                )}
              >
                <Icon name="library_music" className="text-sm" />
                {t.view_sheet_music}
              </button>
            </div>
          </div>
        )}

        {viewMode === 'sheet' && song.pdfSheetMusicUrl ? (
          <PDFViewer url={song.pdfSheetMusicUrl} title={song.title} language={language} />
        ) : (
          <section 
            className="space-y-6 md:space-y-10 font-headline"
            style={{ fontSize: `${settings.fontSize}px` }}
          >
            {song.content ? song.content.split('\n').map((line, i) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return <div key={i} className="h-4 md:h-8" />;
            
            const isHeader = isSectionHeader(trimmedLine);
            if (isHeader) {
              return (
                <div 
                  key={i} 
                  className="text-primary/60 font-label text-[10px] md:text-sm uppercase tracking-[0.2em] mt-8 md:mt-12 mb-2 md:mb-4 border-b border-primary/10 pb-1"
                >
                  {formatHeader(trimmedLine)}
                </div>
              );
            }
            
            const hasChords = trimmedLine.includes('[');
            
            // Group chords with the text that follows them
            const segments = hasChords ? trimmedLine.split(/(\[.*?\])/).filter(Boolean) : [trimmedLine];
            const groups: { chord?: string, text: string }[] = [];
            
            if (hasChords) {
              for (let k = 0; k < segments.length; k++) {
                if (segments[k].startsWith('[')) {
                  const chord = segments[k].slice(1, -1);
                  const nextPart = segments[k+1];
                  const text = (nextPart && !nextPart.startsWith('[')) ? nextPart : '';
                  groups.push({ chord, text });
                  if (text) k++; // Skip the text part in next iteration
                } else {
                  groups.push({ text: segments[k] });
                }
              }
            } else {
              groups.push({ text: trimmedLine });
            }
            
            return (
              <div 
                key={i} 
                className={cn(
                  "flex flex-wrap items-end leading-none pb-4 transition-all rounded-lg px-2 -mx-2",
                  isFocusMode ? "bg-surface-container-low/40 shadow-sm border border-outline-variant/5" : ""
                )}
              >
                {groups.map((group, j) => (
                  <div 
                    key={j} 
                    className="inline-flex flex-col min-w-fit group/segment"
                  >
                    <div 
                      className="font-bold font-label whitespace-nowrap leading-none mb-1.5"
                      style={{ 
                        color: effectiveColors.chordColor,
                        fontSize: `${settings.fontSize * 0.6}px`,
                        height: `${settings.fontSize * 0.7}px`,
                        display: 'flex',
                        alignItems: 'flex-end',
                        paddingRight: group.chord ? '0.5em' : '0'
                      }}
                    >
                      {group.chord ? transposeChord(group.chord, chordTransposeAmount) : '\u00A0'}
                    </div>
                    <span 
                      className="whitespace-pre leading-normal"
                      style={{ color: effectiveColors.lyricColor }}
                    >
                      {group.text || '\u00A0'}
                    </span>
                  </div>
                ))}
              </div>
            );
          }) : <div className="text-on-surface-variant/30 italic">{t.no_lyrics}</div>}
        </section>
      )}
      </main>

      <nav className="fixed bottom-0 left-0 w-full z-50 px-4 pb-4">
        <div className="max-w-fit mx-auto bg-surface-container-highest/95 backdrop-blur-2xl rounded-full p-1 flex items-center gap-1 shadow-2xl border border-outline-variant/10">
          {/* Library Button */}
          <button 
            onClick={() => navigate(currentSetlist ? "/setlists" : "/")}
            className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors active:scale-90"
            title={t.library}
          >
            <Icon name="grid_view" className="text-xl" />
          </button>

          <div className="w-[1px] h-6 bg-outline-variant/20 mx-1" />

          {/* Speed Control */}
          <button 
            onClick={cycleSpeed}
            className={cn(
              "w-10 h-10 flex flex-col items-center justify-center rounded-full transition-all active:scale-90",
              scrollSpeed !== 1 ? "text-primary bg-primary/10" : "text-on-surface-variant hover:bg-surface-bright"
            )}
            title={t.autoscroll}
          >
            <Icon name="speed" className="text-lg" />
            <span className="font-label text-[8px] font-black uppercase leading-none mt-0.5">{scrollSpeed}x</span>
          </button>

          {/* Play Button */}
          <button 
            onClick={toggleScroll}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-on-primary shadow-lg active:scale-95 transition-all hover:scale-105",
              isScrolling ? "bg-secondary" : "bg-primary"
            )}
            title={isScrolling ? t.pause : t.play}
          >
            <Icon name={isScrolling ? "pause" : "play_arrow"} className="text-2xl fill-1" />
          </button>

          {/* Metronome Control */}
          <button 
            onClick={() => setIsMetronomeActive(!isMetronomeActive)}
            className={cn(
              "w-10 h-10 flex flex-col items-center justify-center rounded-full transition-all active:scale-90",
              isMetronomeActive ? "text-secondary bg-secondary/10" : "text-on-surface-variant hover:bg-surface-bright"
            )}
            title={t.visual_click}
          >
            <div className="relative">
              <Icon name="timer" className="text-lg" />
              {isMetronomeActive && (
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-secondary rounded-full animate-pulse" />
              )}
            </div>
            <span className="font-label text-[8px] font-black uppercase leading-none mt-0.5">Click</span>
          </button>

          <div className="w-[1px] h-6 bg-outline-variant/20 mx-1" />

          {/* Text Size Control */}
          <button 
            onClick={cycleFontSize}
            className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors active:scale-90"
            title={t.font_size}
          >
            <Icon name="text_fields" className="text-xl" />
          </button>

          {/* Focus Mode Control */}
          <button 
            onClick={toggleFocusMode}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-full transition-colors active:scale-90",
              isFocusMode ? "text-primary bg-primary/10" : "text-on-surface-variant hover:bg-surface-container-low"
            )}
            title={t.focus_mode}
          >
            <Icon name={isFocusMode ? "visibility_off" : "visibility"} className="text-xl" />
          </button>
        </div>
      </nav>

      {activeYoutubeId && (
        <div className="fixed bottom-24 right-4 z-50 bg-surface-container-high rounded-2xl border border-red-500/20 shadow-2xl p-4 flex flex-col gap-3 transition-all duration-300 w-80">
          <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full bg-red-500", isYoutubePlaying && "animate-pulse")} />
              <span className="font-label text-[9px] uppercase tracking-widest font-bold text-on-surface">YouTube Player</span>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsYoutubeHidden(!isYoutubeHidden)}
                className="p-1 hover:bg-surface-container-highest rounded-md text-xs text-on-surface-variant transition-colors"
                title={isYoutubeHidden ? t.show_video : t.hide_video}
              >
                <Icon name={isYoutubeHidden ? "visibility" : "visibility_off"} />
              </button>
              <button 
                onClick={() => {
                  window.open(song.youtubeUrl, '_blank');
                }}
                className="p-1 hover:bg-surface-container-highest rounded-md text-xs text-on-surface-variant transition-colors"
                title={t.open_youtube}
              >
                <Icon name="open_in_new" />
              </button>
              <button 
                onClick={() => setActiveYoutubeId(null)}
                className="p-1 hover:bg-surface-container-highest rounded-md text-xs text-on-surface-variant text-error transition-colors"
                title={t.close}
              >
                <Icon name="close" />
              </button>
            </div>
          </div>

          {/* Container for dynamic YouTube element. In background mode, it's offscreen but still fully mounted */}
          <div className={cn(
            "relative overflow-hidden rounded-xl bg-black transition-all duration-300", 
            isYoutubeHidden 
              ? "fixed -left-[9999px] -top-[9999px] w-[320px] h-[180px] pointer-events-none z-50" 
              : "w-full aspect-video"
          )}>
            <div id="youtube-player-container" className="w-full h-full aspect-video">
              <iframe
                id="youtube-iframe-player"
                src={`https://www.youtube.com/embed/${activeYoutubeId}?autoplay=1&mute=0&rel=0&enablejsapi=1&playsinline=1&origin=${window.location.origin}`}
                title="YouTube video player"
                 frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Song Info */}
          <div className="flex flex-col px-1">
            <div className="text-sm font-bold text-on-surface truncate">{song.title}</div>
            <div className="text-xs text-on-surface-variant truncate">{song.artist}</div>
            {isYoutubeHidden && (
              <div className="text-[10px] text-green-500 font-medium flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {language === 'pt-BR' || language === 'pt-PT' ? 'Áudio tocando em segundo plano...' : 'Audio playing in background...'}
              </div>
            )}
          </div>

          {/* Progress Bar & Slider */}
          <div className="flex flex-col gap-1 px-1">
            <div className="flex items-center justify-between text-[10px] text-on-surface-variant/70 font-mono">
              <span>{(() => {
                const m = Math.floor(youtubeCurrentTime / 60);
                const s = Math.floor(youtubeCurrentTime % 60);
                return `${m}:${s < 10 ? '0' : ''}${s}`;
              })()}</span>
              <span>{(() => {
                const m = Math.floor(youtubeTotalDuration / 60);
                const s = Math.floor(youtubeTotalDuration % 60);
                return `${m}:${s < 10 ? '0' : ''}${s}`;
              })()}</span>
            </div>
            <input
              type="range"
              min="0"
              max={youtubeTotalDuration || 100}
              value={youtubeCurrentTime}
              onChange={(e) => {
                const seekVal = parseFloat(e.target.value);
                setYoutubeCurrentTime(seekVal);
                if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
                  ytPlayerRef.current.seekTo(seekVal, true);
                }
              }}
              className="w-full h-1 bg-outline-variant/30 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none"
            />
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-center gap-4 py-1 border-t border-outline-variant/10 pt-2">
            {/* Rewind 10 Seconds */}
            <button
              onClick={() => {
                if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
                  const current = ytPlayerRef.current.getCurrentTime();
                  const target = Math.max(0, current - 10);
                  setYoutubeCurrentTime(target);
                  ytPlayerRef.current.seekTo(target, true);
                }
              }}
              className="w-9 h-9 flex items-center justify-center hover:bg-surface-container-highest rounded-full text-on-surface hover:text-red-500 transition-all active:scale-90"
              title="-10s"
            >
              <Icon name="replay_10" className="text-xl" />
            </button>

            {/* Play/Pause Toggle */}
            <button
              onClick={() => {
                if (ytPlayerRef.current) {
                  try {
                    if (isYoutubePlaying) {
                      ytPlayerRef.current.pauseVideo();
                      setIsYoutubePlaying(false);
                    } else {
                      ytPlayerRef.current.playVideo();
                      setIsYoutubePlaying(true);
                    }
                  } catch (e) {
                    console.error("Failed to toggle play state:", e);
                  }
                }
              }}
              className="w-12 h-12 flex items-center justify-center bg-red-500 hover:bg-red-600 rounded-full text-white shadow-md hover:shadow-lg transition-all active:scale-95"
              title={isYoutubePlaying ? "Pause" : "Play"}
            >
              <Icon name={isYoutubePlaying ? "pause" : "play_arrow"} className="text-2xl" />
            </button>

            {/* Fast Forward 10 Seconds */}
            <button
              onClick={() => {
                if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
                  const current = ytPlayerRef.current.getCurrentTime();
                  const duration = ytPlayerRef.current.getDuration() || 0;
                  const target = Math.min(duration, current + 10);
                  setYoutubeCurrentTime(target);
                  ytPlayerRef.current.seekTo(target, true);
                }
              }}
              className="w-9 h-9 flex items-center justify-center hover:bg-surface-container-highest rounded-full text-on-surface hover:text-red-500 transition-all active:scale-90"
              title="+10s"
            >
              <Icon name="forward_10" className="text-xl" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

const SetlistEditorView = ({ songs, setlists, onSave, language }: { songs: Song[], setlists: Setlist[], onSave: (setlist: Setlist) => void, language: Language }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useTranslation(language);
  const existingSetlist = setlists.find(s => s.id === id);
  
  const [name, setName] = useState(existingSetlist?.name || '');
  const [description, setDescription] = useState(existingSetlist?.description || '');
  const [type, setType] = useState<Setlist['type']>(existingSetlist?.type || 'gig');
  const [selectedSongs, setSelectedSongs] = useState<string[]>(existingSetlist?.songs || []);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSong = (songId: string) => {
    if (selectedSongs.includes(songId)) {
      setSelectedSongs(selectedSongs.filter(id => id !== songId));
    } else {
      setSelectedSongs([...selectedSongs, songId]);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return alert('Please enter a setlist name');
    
    const setlist: Setlist = {
      id: id || Math.random().toString(36).substr(2, 9),
      name,
      description,
      type,
      songs: selectedSongs,
      lastModified: 'Just now',
      upcomingDate: existingSetlist?.upcomingDate
    };
    
    onSave(setlist);
    navigate('/setlists');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-background pb-24 md:pb-32"
    >
      <header className="sticky top-0 bg-background/80 backdrop-blur-xl z-50 border-b border-outline-variant/10">
        <div className="max-w-5xl mx-auto px-3 md:px-6 py-2 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={() => navigate('/setlists')} className="p-1.5 md:p-2 hover:bg-surface-container-highest rounded-full transition-colors">
              <Icon name="arrow_back" />
            </button>
            <h2 className="font-headline text-base md:text-2xl font-black tracking-tighter text-on-surface truncate max-w-[150px] sm:max-w-none">
              {id ? t.edit_setlist : t.new_setlist}
            </h2>
          </div>
          <button 
            onClick={handleSave}
            className="bg-primary text-on-primary px-4 md:px-6 py-1.5 md:py-2 rounded-xl font-label text-xs md:text-sm font-bold flex items-center gap-1.5 md:gap-2 shadow-lg hover:bg-primary/90 transition-all active:scale-95"
          >
            <Icon name="check" className="text-xs md:text-sm" />
            <span className="hidden sm:inline">{t.save_setlist}</span>
            <span className="sm:hidden">{t.save}</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 pt-6 md:pt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-surface-container-low p-4 md:p-6 rounded-3xl space-y-4 border border-outline-variant/10">
            <h3 className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-semibold">{t.setlist_details}</h3>
            <div className="space-y-4">
              <div>
                <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">{t.name}</label>
                <input 
                  className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-primary rounded-xl p-2 md:p-3 text-on-surface font-headline font-bold text-base md:text-lg" 
                  placeholder={t.setlist_name_placeholder} 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">{t.description}</label>
                <textarea 
                  className="w-full bg-surface-container-highest border-none focus:ring-1 focus:ring-primary rounded-xl p-2 md:p-3 text-on-surface font-body text-xs md:text-sm min-h-[80px] md:min-h-[100px]" 
                  placeholder={t.setlist_desc_placeholder} 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="block font-label text-[9px] md:text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">{t.type}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['gig', 'rehearsal', 'festival', 'other'] as const).map((typeKey) => (
                    <button
                      key={typeKey}
                      onClick={() => setType(typeKey)}
                      className={cn(
                        "py-1.5 md:py-2 px-3 md:px-4 rounded-lg font-label text-[9px] md:text-[10px] uppercase tracking-widest transition-all",
                        type === typeKey ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-bright"
                      )}
                    >
                      {t[typeKey as keyof typeof t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-surface-container-low p-4 md:p-6 rounded-3xl border border-outline-variant/10">
            <h3 className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-semibold mb-4">{t.selected_songs} ({selectedSongs.length})</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {selectedSongs.map((songId, index) => {
                const song = songs.find(s => s.id === songId);
                if (!song) return null;
                return (
                  <div key={song.id} className="flex items-center gap-2 md:gap-3 p-1.5 md:p-2 bg-surface-container rounded-xl group">
                    <span className="w-5 md:w-6 text-center font-label text-[9px] md:text-[10px] text-on-surface-variant">{index + 1}</span>
                    <div className="flex-grow min-w-0">
                      <p className="font-headline font-bold text-xs md:text-sm text-on-surface truncate">{song.title}</p>
                      <p className="font-label text-[9px] md:text-[10px] text-on-surface-variant truncate">{song.artist}</p>
                    </div>
                    <button 
                      onClick={() => toggleSong(song.id)}
                      className="p-1.5 md:p-2 text-on-surface-variant hover:text-error transition-colors"
                    >
                      <Icon name="delete" className="text-xs md:text-sm" />
                    </button>
                  </div>
                );
              })}
              {selectedSongs.length === 0 && (
                <div className="text-center py-6 md:py-8 text-on-surface-variant/40 italic text-xs md:text-sm">
                  {t.no_songs_selected_yet}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="bg-surface-container-low p-3 md:p-4 rounded-2xl flex items-center gap-2 md:gap-3 border border-outline-variant/10">
            <Icon name="search" className="text-on-surface-variant text-sm md:text-base" />
            <input 
              className="bg-transparent border-none focus:ring-0 text-on-surface font-body text-xs md:text-sm w-full" 
              placeholder={t.search_library} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredSongs.map((song) => {
              const isSelected = selectedSongs.includes(song.id);
              return (
                <div 
                  key={song.id}
                  onClick={() => toggleSong(song.id)}
                  className={cn(
                    "p-2 md:p-4 rounded-2xl cursor-pointer transition-all border-2",
                    isSelected 
                      ? "bg-primary/10 border-primary shadow-lg shadow-primary/5" 
                      : "bg-surface-container-low border-transparent hover:border-outline-variant/30"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg overflow-hidden bg-surface-container-highest">
                      {song.coverUrl ? (
                        <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-primary font-bold text-xs md:text-base">{song.key}</div>
                      )}
                    </div>
                    {isSelected && <Icon name="check" className="text-primary text-lg md:text-xl" />}
                  </div>
                  <h4 className="font-headline font-bold text-sm md:text-base text-on-surface truncate">{song.title}</h4>
                  <p className="font-label text-[10px] md:text-xs text-on-surface-variant truncate">{song.artist}</p>
                  <div className="flex gap-2 mt-2 md:mt-3">
                    <span className="text-[8px] md:text-[9px] font-label font-bold uppercase tracking-widest bg-surface-container-highest px-1.5 md:px-2 py-0.5 rounded text-on-surface-variant">
                      {song.key}
                    </span>
                    <span className="text-[8px] md:text-[9px] font-label font-bold uppercase tracking-widest bg-surface-container-highest px-1.5 md:px-2 py-0.5 rounded text-on-surface-variant">
                      {song.bpm} BPM
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </motion.div>
  );
};

const SettingsView = ({ 
  settings, 
  onUpdateSettings, 
  language,
  onImportData
}: { 
  settings: PerformanceSettings, 
  onUpdateSettings: (s: PerformanceSettings) => void, 
  language: Language,
  onImportData: (data: { songs: Song[], setlists: Setlist[], settings: PerformanceSettings }) => void
}) => {
  const [activeSection, setActiveSection] = useState<'appearance' | 'color' | 'language' | 'stage' | 'streaming' | 'data' | null>(null);
  const t = useTranslation(language);

  const currentTheme = useMemo(() => {
    if (settings.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return settings.theme;
  }, [settings.theme]);

  const effectiveColors = useMemo(() => {
    if (currentTheme === 'light') {
      const lyricColor = '#000000';
      const isNearWhite = (color: string) => {
        const hex = color.replace('#', '');
        if (hex.length !== 6) return false;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 200;
      };
      const chordColor = isNearWhite(settings.chordColor) ? '#000000' : settings.chordColor;
      return { lyricColor, chordColor };
    }
    return { lyricColor: settings.lyricColor, chordColor: settings.chordColor };
  }, [currentTheme, settings.lyricColor, settings.chordColor]);

  const sections = [
    { 
      id: 'appearance', 
      title: t.appearance, 
      subtitle: t.appearance_desc,
      icon: 'palette',
      color: 'text-primary'
    },
    { 
      id: 'color', 
      title: t.color_theme, 
      subtitle: t.color_theme_desc,
      icon: 'contrast',
      color: 'text-tertiary'
    },
    { 
      id: 'language', 
      title: t.language, 
      subtitle: t.language_desc,
      icon: 'language',
      color: 'text-blue-500'
    },
    { 
      id: 'stage', 
      title: t.stage_controls, 
      subtitle: t.stage_controls_desc,
      icon: 'settings_input_component',
      color: 'text-secondary'
    },
    { 
      id: 'data', 
      title: t.data_management, 
      subtitle: t.data_management_desc,
      icon: 'database',
      color: 'text-amber-500'
    },
    { 
      id: 'streaming', 
      title: language === 'pt-BR' || language === 'pt-PT' ? 'Integração com YouTube' : 'YouTube Integration', 
      subtitle: language === 'pt-BR' || language === 'pt-PT' ? 'Ative ou desative o player e as guias de áudio/vídeo do YouTube' : 'Enable or disable YouTube audio/video guide player',
      icon: 'smart_display',
      color: 'text-red-500'
    }
  ];

  const handleConnect = async (providerId: string) => {
    if (providerId === 'youtube') {
      const newAccounts = settings.streamingAccounts?.map(a => 
        a.id === 'youtube' ? { ...a, connected: true } : a
      );
      onUpdateSettings({ ...settings, streamingAccounts: newAccounts });
      toast.success(language === 'pt-BR' || language === 'pt-PT' 
        ? "Conexão com o YouTube ativada! Você já pode salvar links de vídeos."
        : "YouTube integration activated! You can now save video links."
      );
    }
  };

  const handleDisconnect = async (providerId: string) => {
    if (providerId === 'youtube') {
      const newAccounts = settings.streamingAccounts?.map(a => 
        a.id === 'youtube' ? { ...a, connected: false } : a
      );
      onUpdateSettings({ ...settings, streamingAccounts: newAccounts });
    }
  };

  const handleExport = () => {
    storage.exportData();
    toast.success(t.export_success);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await storage.importData(file);
    if (data) {
      onImportData(data);
      toast.success(t.import_success);
    } else {
      toast.error(t.import_error);
    }
  };

  if (activeSection === 'data') {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="px-3 md:px-6 pt-4 md:pt-8 pb-24 max-w-2xl mx-auto w-full"
      >
        <header className="mb-6 md:mb-10 flex items-center gap-4">
          <button 
            onClick={() => setActiveSection(null)}
            className="p-2 hover:bg-surface-container-highest rounded-xl text-primary transition-colors active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
          <div>
            <h2 className="font-headline text-2xl md:text-4xl font-black tracking-tighter text-on-surface">{t.data_management}</h2>
            <p className="text-on-surface-variant text-xs md:text-sm">{t.data_management_desc}</p>
          </div>
        </header>

        <div className="space-y-6">
          <div className="p-6 bg-surface-container-low rounded-3xl border border-outline-variant/10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Icon name="storage" />
            </div>
            <div>
              <h3 className="font-bold text-on-surface">{t.local_storage_active}</h3>
              <p className="text-xs text-on-surface-variant">{t.local_storage_desc}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleExport}
              className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/10 hover:bg-surface-container transition-all flex flex-col items-center gap-3 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                <Icon name="download" />
              </div>
              <span className="font-bold text-on-surface">{t.export_data}</span>
            </button>

            <label className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/10 hover:bg-surface-container transition-all flex flex-col items-center gap-3 group cursor-pointer">
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImport}
                className="hidden" 
              />
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Icon name="upload" />
              </div>
              <span className="font-bold text-on-surface">{t.import_data}</span>
            </label>
          </div>
        </div>
      </motion.div>
    );
  }

  if (activeSection === 'appearance') {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="px-3 md:px-6 pt-4 md:pt-8 pb-24 max-w-5xl mx-auto w-full"
      >
        <header className="mb-6 md:mb-10 flex items-center gap-4">
          <button 
            onClick={() => setActiveSection(null)}
            className="p-2 hover:bg-surface-container-highest rounded-xl text-primary transition-colors active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
          <div>
            <h2 className="font-headline text-2xl md:text-4xl font-black tracking-tighter text-on-surface">{t.appearance}</h2>
            <p className="text-on-surface-variant text-xs md:text-sm">{t.appearance_desc}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
          <div className="lg:col-span-5 lg:order-2 sticky top-0 lg:top-8 z-30 bg-background/95 backdrop-blur-sm lg:bg-transparent py-2 lg:py-0 -mx-3 px-3 lg:mx-0 lg:px-0 border-b border-outline-variant/10 lg:border-none">
            <section className="bg-surface-container-low p-3 md:p-6 rounded-2xl border border-outline-variant/10 shadow-sm lg:shadow-none">
              <h3 className="font-label text-[10px] md:text-xs uppercase tracking-[0.2em] text-on-surface-variant font-semibold mb-2 md:mb-4">{t.live_preview}</h3>
              <div className="bg-background p-3 md:p-8 rounded-xl border border-outline-variant/10 min-h-[120px] md:min-h-[200px] flex flex-col justify-center items-center text-center">
                <div 
                  className="relative inline-flex flex-col"
                  style={{ paddingTop: `${settings.fontSize * 1.2}px` }}
                >
                  <span 
                    className="absolute top-0 left-0 font-bold font-label whitespace-nowrap leading-none"
                    style={{ 
                      color: effectiveColors.chordColor,
                      fontSize: `${settings.fontSize * 0.6}px`
                    }}
                  >
                    G#m7
                  </span>
                  <span 
                    className="font-headline whitespace-pre leading-normal"
                    style={{ 
                      color: effectiveColors.lyricColor,
                      fontSize: `${settings.fontSize}px`
                    }}
                  >
                    {t.example_lyric}
                  </span>
                </div>
                <p className="mt-4 md:mt-8 font-label text-[8px] md:text-[10px] uppercase tracking-widest text-on-surface-variant opacity-40">{t.preview_desc}</p>
              </div>
            </section>
          </div>

          <div className="lg:col-span-7 lg:order-1 space-y-6">
            <section className="bg-surface-container-low p-4 md:p-6 rounded-2xl space-y-6 border border-outline-variant/10">
              <div className="space-y-6">
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">{t.font_size} ({settings.fontSize}px)</label>
                    <div className="flex flex-wrap gap-2">
                      {[18, 24, 28, 32, 40].map(size => (
                        <button 
                          key={size}
                          onClick={() => onUpdateSettings({ ...settings, fontSize: size })}
                          className={cn(
                            "w-8 h-8 rounded-lg font-label text-[10px] transition-all",
                            settings.fontSize === size ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-bright"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="16" 
                    max="64" 
                    value={settings.fontSize}
                    onChange={(e) => onUpdateSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-3">{t.chord_color}</label>
                    <div className="flex flex-wrap gap-2">
                      {['#00E676', '#FFD600', '#FF1744', '#2979FF', '#D500F9', '#FFFFFF'].map(color => (
                        <button 
                          key={color}
                          onClick={() => onUpdateSettings({ ...settings, chordColor: color })}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition-all",
                            settings.chordColor === color ? "border-primary scale-110" : "border-transparent"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-3">{t.lyric_color}</label>
                    <div className="flex flex-wrap gap-2">
                      {['#FFFFFF', '#E0E0E0', '#9E9E9E', '#FFD180', '#A7FFEB', '#F8BBD0'].map(color => (
                        <button 
                          key={color}
                          onClick={() => onUpdateSettings({ ...settings, lyricColor: color })}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition-all",
                            settings.lyricColor === color ? "border-primary scale-110" : "border-transparent"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </motion.div>
    );
  }

  if (activeSection === 'color') {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="px-3 md:px-6 pt-4 md:pt-8 pb-24 max-w-5xl mx-auto w-full"
      >
        <header className="mb-6 md:mb-10 flex items-center gap-4">
          <button 
            onClick={() => setActiveSection(null)}
            className="p-2 hover:bg-surface-container-highest rounded-xl text-primary transition-colors active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
          <div>
            <h2 className="font-headline text-2xl md:text-4xl font-black tracking-tighter text-on-surface">{t.color_theme}</h2>
            <p className="text-on-surface-variant text-xs md:text-sm">{t.color_theme_desc}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'system', label: t.theme_system, icon: 'settings_brightness', desc: t.theme_system_desc },
            { id: 'light', label: t.theme_light, icon: 'light_mode', desc: t.theme_light_desc },
            { id: 'dark', label: t.theme_dark, icon: 'dark_mode', desc: t.theme_dark_desc }
          ].map((theme) => (
            <button
              key={theme.id}
              onClick={() => onUpdateSettings({ ...settings, theme: theme.id as any })}
              className={cn(
                "p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-4",
                settings.theme === theme.id 
                  ? "bg-primary/10 border-primary shadow-lg shadow-primary/10" 
                  : "bg-surface-container-low border-transparent hover:bg-surface-container hover:border-outline-variant/30"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                settings.theme === theme.id ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"
              )}>
                <Icon name={theme.icon} className="text-2xl" />
              </div>
              <div>
                <h3 className={cn("font-bold text-lg", settings.theme === theme.id ? "text-primary" : "text-on-surface")}>{theme.label}</h3>
                <p className="text-xs text-on-surface-variant opacity-70">{theme.desc}</p>
              </div>
              {settings.theme === theme.id && (
                <div className="mt-auto flex justify-end">
                  <Icon name="check_circle" className="text-primary fill-1" />
                </div>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    );
  }

  if (activeSection === 'language') {
    const languages: { id: Language; label: string; flag: string }[] = [
      { id: 'en-US', label: 'English (US)', flag: '🇺🇸' },
      { id: 'pt-PT', label: 'Português (Portugal)', flag: '🇵🇹' },
      { id: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
      { id: 'es-ES', label: 'Español', flag: '🇪🇸' },
      { id: 'fr-FR', label: 'Français', flag: '🇫🇷' },
      { id: 'zh-CN', label: '中文 (简体)', flag: '🇨🇳' },
      { id: 'ja-JP', label: '日本語', flag: '🇯🇵' },
      { id: 'de-DE', label: 'Deutsch', flag: '🇩🇪' },
      { id: 'it-IT', label: 'Italiano', flag: '🇮🇹' },
    ];

    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="px-3 md:px-6 pt-4 md:pt-8 pb-24 max-w-2xl mx-auto w-full"
      >
        <header className="mb-6 md:mb-10 flex items-center gap-4">
          <button 
            onClick={() => setActiveSection(null)}
            className="p-2 hover:bg-surface-container-highest rounded-xl text-primary transition-colors active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
          <div>
            <h2 className="font-headline text-2xl md:text-4xl font-black tracking-tighter text-on-surface">{t.language}</h2>
            <p className="text-on-surface-variant text-xs md:text-sm">{t.language_desc}</p>
          </div>
        </header>

        <div className="space-y-3">
          {languages.map((lang) => (
            <button
              key={lang.id}
              onClick={() => onUpdateSettings({ ...settings, language: lang.id })}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.98]",
                settings.language === lang.id 
                  ? "bg-primary/10 border-primary text-primary shadow-sm" 
                  : "bg-surface-container-low border-outline-variant/10 text-on-surface hover:border-primary/30"
              )}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">{lang.flag}</span>
                <span className="font-medium">{lang.label}</span>
              </div>
              {settings.language === lang.id && (
                <Icon name="check_circle" className="text-primary" />
              )}
            </button>
          ))}
        </div>
      </motion.div>
    );
  }

  if (activeSection === 'stage') {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="px-3 md:px-6 pt-4 md:pt-8 pb-24 max-w-5xl mx-auto w-full"
      >
        <header className="mb-6 md:mb-10 flex items-center gap-4">
          <button 
            onClick={() => setActiveSection(null)}
            className="p-2 hover:bg-surface-container-highest rounded-xl text-primary transition-colors active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
          <div>
            <h2 className="font-headline text-2xl md:text-4xl font-black tracking-tighter text-on-surface">{t.stage_controls}</h2>
            <p className="text-on-surface-variant text-xs md:text-sm">{t.stage_controls_desc}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-surface-container-low p-4 md:p-6 rounded-2xl space-y-6 border border-outline-variant/10">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant/10">
                  <div className="flex items-center gap-3">
                    <Icon name="auto_awesome" className="text-secondary" />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm md:text-base">{t.auto_transpose}</span>
                      <span className="text-[10px] text-on-surface-variant uppercase tracking-widest opacity-60">{t.auto_transpose_desc}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => onUpdateSettings({ ...settings, autoTranspose: !settings.autoTranspose })}
                    className={cn(
                      "w-10 h-5 md:w-12 md:h-6 rounded-full relative p-1 transition-colors duration-300",
                      settings.autoTranspose ? "bg-primary" : "bg-surface-container-highest"
                    )}
                  >
                    <motion.div 
                      animate={{ x: settings.autoTranspose ? (window.innerWidth >= 768 ? 24 : 20) : 0 }}
                      className={cn(
                        "w-3 h-3 md:w-4 md:h-4 rounded-full",
                        settings.autoTranspose ? "bg-on-primary" : "bg-on-surface-variant/30"
                      )}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant/10">
                  <div className="flex items-center gap-3">
                    <Icon name="timer" className="text-on-surface-variant" />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm md:text-base">{t.visual_click}</span>
                      <span className="text-[10px] text-on-surface-variant uppercase tracking-widest opacity-60">{t.visual_click_desc}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => onUpdateSettings({ ...settings, visualClick: !settings.visualClick })}
                    className={cn(
                      "w-10 h-5 md:w-12 md:h-6 rounded-full relative p-1 transition-colors duration-300",
                      settings.visualClick ? "bg-primary" : "bg-surface-container-highest"
                    )}
                  >
                    <motion.div 
                      animate={{ x: settings.visualClick ? (window.innerWidth >= 768 ? 24 : 20) : 0 }}
                      className={cn(
                        "w-3 h-3 md:w-4 md:h-4 rounded-full",
                        settings.visualClick ? "bg-on-primary" : "bg-on-surface-variant/30"
                      )}
                    />
                  </button>
                </div>
              </div>

              {settings.visualClick && (
                <div className="mt-8 p-6 bg-surface-container rounded-2xl border border-primary/20 text-center relative overflow-hidden">
                  <motion.div 
                    animate={{ opacity: [0, 0.2, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="absolute inset-0 bg-primary pointer-events-none"
                  />
                  <Icon name="timer" className="text-primary text-3xl mb-2 animate-pulse" />
                  <p className="font-label text-[10px] uppercase tracking-widest text-primary font-bold">{t.visual_click_active}</p>
                  <p className="text-on-surface-variant text-xs mt-1">{t.visual_click_active_desc}</p>
                </div>
              )}
            </section>
          </div>

          <div className="lg:col-span-5">
            <section className="bg-surface-container-low p-4 md:p-6 rounded-2xl border border-outline-variant/10">
              <h3 className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-semibold mb-4">{t.visual_context}</h3>
              <div className="rounded-xl overflow-hidden aspect-video relative group cursor-pointer">
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10"></div>
                <img 
                  alt="Stage lighting" 
                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBES2NhXpGiNepQiOR-2Rociyg-QNSkWqNFVWyONo1-IyiymE14N9G58hHkbREnN4Z0KtF9LBSZK0jyoShjQFuY9m-FWrbUL3kCHIYTwm1xoSRpn7S7nOVtmdSCkL3CSt-Zu-8jRkdVKuytqoMU_XXVGamGW2Q2feR2kPjcWzZ-dagEcqnLFQGOhKqEi7EJrU1R5JoqhJBMkLP94NTU4wQBGMxLtnNGwmU9WZ9p7160qhvvw9t_DlSYh_Vtp-eAzzthbfUeF2hVpP7"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-3 md:bottom-4 left-3 md:left-4 z-20">
                  <p className="font-label text-[8px] md:text-[10px] uppercase tracking-[0.3em] text-primary">{t.stage_preview}</p>
                  <p className="text-white font-bold text-xs md:text-sm">{t.visual_contrast}: {t.high}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </motion.div>
    );
  }

  if (activeSection === 'streaming') {
    const youtubeAccount = (settings.streamingAccounts || []).find(a => a.id === 'youtube') || { id: 'youtube', name: 'YouTube', connected: false };
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="px-3 md:px-6 pt-4 md:pt-8 pb-24 max-w-5xl mx-auto w-full"
      >
        <header className="mb-6 md:mb-10 flex items-center gap-4">
          <button 
            onClick={() => setActiveSection(null)}
            className="p-2 hover:bg-surface-container-highest rounded-xl text-primary transition-colors active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
          <div>
            <h2 className="font-headline text-2xl md:text-4xl font-black tracking-tighter text-on-surface">
              {language === 'pt-BR' || language === 'pt-PT' ? 'Integração com YouTube' : 'YouTube Integration'}
            </h2>
            <p className="text-on-surface-variant text-xs md:text-sm">
              {language === 'pt-BR' || language === 'pt-PT' 
                ? 'Ative ou desative o player e as guias de áudio/vídeo do YouTube' 
                : 'Enable or disable YouTube audio / video guide play'}
            </p>
          </div>
        </header>

        <div className="max-w-xl">
          <div className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/10 flex items-center justify-between group hover:bg-surface-container transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-red-500/10 text-red-500">
                <Icon name="smart_display" />
              </div>
              <div>
                <h4 className="font-headline font-bold text-on-surface">YouTube Player</h4>
                <p className={cn(
                  "font-label text-[10px] uppercase tracking-widest",
                  youtubeAccount.connected ? "text-green-500" : "text-on-surface-variant/40"
                )}>
                  {youtubeAccount.connected 
                    ? (language === 'pt-BR' || language === 'pt-PT' ? 'Ativado' : 'Activated') 
                    : (language === 'pt-BR' || language === 'pt-PT' ? 'Desativado' : 'Deactivated')}
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                if (youtubeAccount.connected) {
                  handleDisconnect('youtube');
                } else {
                  handleConnect('youtube');
                }
              }}
              className={cn(
                "px-5 py-2.5 rounded-xl font-label text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95",
                youtubeAccount.connected 
                  ? "bg-surface-container-highest text-on-surface-variant hover:text-error hover:bg-error/10" 
                  : "bg-red-650 hover:bg-red-700 text-white shadow-lg shadow-red-650/20"
              )}
            >
              {youtubeAccount.connected 
                ? (language === 'pt-BR' || language === 'pt-PT' ? 'Desativar' : 'Deactivate') 
                : (language === 'pt-BR' || language === 'pt-PT' ? 'Ativar' : 'Activate')}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-3 md:px-6 pt-4 md:pt-8 pb-24 max-w-2xl mx-auto w-full"
    >
      <header className="mb-8 md:mb-12">
        <h2 className="font-headline text-2xl md:text-5xl font-black tracking-tighter text-on-surface">{t.settings}</h2>
        <p className="text-on-surface-variant mt-1 md:mt-2 text-sm md:text-base">{t.settings_desc}</p>
      </header>

      <div className="space-y-3">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id as any)}
            className="w-full flex items-center justify-between p-4 md:p-6 bg-surface-container-low rounded-2xl hover:bg-surface-container transition-all border border-outline-variant/10 group active:scale-[0.98]"
          >
            <div className="flex items-center gap-4 md:gap-6">
              <div className={cn("w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-surface-container-highest flex items-center justify-center transition-transform group-hover:scale-110", section.color)}>
                <Icon name={section.icon} className="text-2xl md:text-3xl" />
              </div>
              <div className="text-left">
                <h3 className="font-headline font-bold text-on-surface text-lg md:text-xl">{section.title}</h3>
                <p className="text-on-surface-variant text-xs md:text-sm opacity-70">{section.subtitle}</p>
              </div>
            </div>
            <Icon name="chevron_right" className="text-on-surface-variant opacity-40 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>

      <div className="mt-12 p-6 bg-surface-container-low rounded-2xl border border-outline-variant/10 text-center">
        <Icon name="info" className="text-primary mb-2" />
        <h4 className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">{t.app_version}</h4>
        <p className="text-on-surface font-bold text-sm">v2.4.0-pro</p>
      </div>
    </motion.div>
  );
};

// --- Profile View ---

const ProfileView = ({ 
  songs, 
  setlists, 
  onToggleSidebar, 
  language,
  userProfile,
  onUpdateProfile
}: { 
  songs: Song[], 
  setlists: Setlist[], 
  onToggleSidebar: () => void, 
  language: Language,
  userProfile: UserProfile,
  onUpdateProfile: (p: UserProfile) => void
}) => {
  const t = useTranslation(language);
  const navigate = useNavigate();
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  
  // Local state for edit form
  const [formName, setFormName] = useState(userProfile.name);
  const [formEmail, setFormEmail] = useState(userProfile.email);
  const [formRole, setFormRole] = useState(userProfile.role);

  const stats = {
    totalSongs: songs.length,
    totalSetlists: setlists.length,
    favorites: songs.filter(s => s.isFavorite).length,
    genres: new Set(songs.map(s => s.genre).filter(Boolean)).size
  };

  const isPt = language.startsWith('pt');
  
  const labelsMap = {
    name: isPt ? 'Nome' : 'Name',
    email: isPt ? 'E-mail' : 'Email',
    is_required: isPt ? 'Campo obrigatório' : 'Required field',
    roleLabel: isPt ? 'Instrumento / Função' : 'Role / Instrument',
    save: isPt ? 'Salvar' : 'Save',
    cancel: isPt ? 'Cancelar' : 'Cancel',
    editProfileTitle: isPt ? 'Editar Perfil' : 'Edit Profile',
    profileUpdated: isPt ? 'Perfil atualizado com sucesso!' : 'Profile updated successfully!'
  };

  const handleOpenEdit = () => {
    setFormName(userProfile.name);
    setFormEmail(userProfile.email);
    setFormRole(userProfile.role);
    setIsEditingModalOpen(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error(isPt ? 'O nome não pode estar vazio.' : 'Name cannot be empty.');
      return;
    }
    
    onUpdateProfile({
      ...userProfile,
      name: formName.trim(),
      email: formEmail.trim(),
      role: formRole.trim(),
    });
    
    setIsEditingModalOpen(false);
    toast.success(labelsMap.profileUpdated);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="px-4 md:px-6 pt-4 pb-24 max-w-5xl mx-auto w-full"
    >
      <header className="flex justify-between items-center mb-6 md:mb-10">
        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="text-primary hover:bg-surface-container-highest p-2 rounded-lg transition-colors active:scale-90"
          >
            <Icon name="arrow_back" />
          </button>
          <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-primary font-headline">{t.profile}</h1>
        </div>
        <button 
          onClick={onToggleSidebar}
          className="text-primary hover:bg-surface-container-highest p-2 rounded-lg transition-colors active:scale-90"
        >
          <Icon name="menu" />
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-surface-container-low p-5 md:p-8 rounded-3xl text-center border border-outline-variant/10 shadow-lg">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/20 flex items-center justify-center text-primary mx-auto mb-4 md:mb-6 border-4 border-surface-container relative group overflow-hidden">
              <Icon name="account_circle" className="text-5xl md:text-6xl" />
            </div>
            <h2 className="font-headline text-xl md:text-2xl font-black text-on-surface mb-1">{userProfile.name}</h2>
            <p className="font-label text-[10px] md:text-xs text-on-surface-variant uppercase tracking-[0.2em] mb-4 md:mb-6">{userProfile.role || t.premium_musician}</p>
            <button 
              onClick={handleOpenEdit}
              className="w-full py-2.5 md:py-3 bg-primary text-on-primary rounded-xl font-label text-xs md:text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors active:scale-[0.98] shadow-md hover:shadow-primary/20 transition-all"
            >
              {t.edit_profile}
            </button>
          </section>

          <section className="bg-surface-container-low p-4 md:p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
            <h3 className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-semibold mb-4 md:mb-6">{t.account_details}</h3>
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-outline-variant/5">
                <span className="text-on-surface-variant text-xs md:text-sm">{t.email}</span>
                <span className="text-on-surface font-medium text-xs md:text-sm truncate ml-4" title={userProfile.email}>{userProfile.email}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-on-surface-variant text-xs md:text-sm">{labelsMap.roleLabel}</span>
                <span className="text-on-surface font-medium text-xs md:text-sm truncate ml-4" title={userProfile.role}>{userProfile.role || '—'}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-8 space-y-6 md:space-y-8">
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: t.songs_stat, value: stats.totalSongs, icon: 'library_music', color: 'text-primary' },
              { label: t.setlists_stat, value: stats.totalSetlists, icon: 'format_list_bulleted', color: 'text-secondary' },
              { label: t.favorites_stat, value: stats.favorites, icon: 'favorite', color: 'text-error' },
              { label: t.genres_stat, value: stats.genres, icon: 'category', color: 'text-tertiary' }
            ].map((stat) => (
              <div key={stat.label} className="bg-surface-container-low p-3 md:p-6 rounded-3xl border border-outline-variant/10 flex flex-col items-center text-center shadow-sm">
                <Icon name={stat.icon} className={cn("text-xl md:text-2xl mb-2 md:mb-3", stat.color)} />
                <span className="text-xl md:text-3xl font-headline font-black text-on-surface mb-0.5 md:mb-1">{stat.value}</span>
                <span className="font-label text-[8px] md:text-[10px] uppercase tracking-widest text-on-surface-variant">{stat.label}</span>
              </div>
            ))}
          </section>

          <section className="bg-surface-container-low p-6 md:p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <h3 className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-semibold">{t.recent_activity}</h3>
              <button className="text-primary font-label text-[10px] md:text-xs uppercase tracking-widest font-bold hover:underline">{t.view_all}</button>
            </div>
            <div className="space-y-4 md:space-y-6">
              {songs.slice(0, 3).map((song) => (
                <div key={song.id} className="flex items-center gap-3 md:gap-4 group cursor-pointer" onClick={() => navigate(`/perform/${song.id}`)}>
                  <div className="w-9 h-9 md:w-12 md:h-12 rounded-xl bg-surface-container-highest overflow-hidden flex-shrink-0">
                    {song.coverUrl ? (
                      <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-on-surface-variant font-bold text-xs md:text-base">{song.key}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-headline font-bold text-xs md:text-base text-on-surface truncate group-hover:text-primary transition-colors">{song.title}</h4>
                    <p className="text-on-surface-variant text-[10px] md:text-xs font-label">{t.modified_ago.replace('{time}', `2 ${t.hours}`)}</p>
                  </div>
                  <Icon name="chevron_right" className="text-outline-variant group-hover:text-primary transition-colors text-sm md:text-base" />
                </div>
              ))}
            </div>
          </section>

          <section className="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
            <h3 className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-semibold mb-6">{t.quick_actions}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => navigate('/edit-song')} className="flex items-center gap-4 p-4 bg-surface-container rounded-2xl hover:bg-surface-container-highest transition-colors text-left group">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Icon name="add_box" />
                </div>
                <div>
                  <span className="block font-bold text-sm text-on-surface">{t.new_song}</span>
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">{t.add_to_library}</span>
                </div>
              </button>
              <button onClick={() => navigate('/setlists/new')} className="flex items-center gap-4 p-4 bg-surface-container rounded-2xl hover:bg-surface-container-highest transition-colors text-left group">
                <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                  <Icon name="playlist_add" />
                </div>
                <div>
                  <span className="block font-bold text-sm text-on-surface">{t.new_setlist}</span>
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">{t.plan_session}</span>
                </div>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Interactive Edit Profile Modal */}
      <AnimatePresence>
        {isEditingModalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingModalOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
            />
            
            {/* Modal Body */}
            <div className="fixed inset-0 flex items-center justify-center p-4 z-[110] pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ type: "spring", duration: 0.4 }}
                className="w-full max-w-md bg-surface-container rounded-3xl border border-outline-variant/15 shadow-2xl p-6 md:p-8 pointer-events-auto"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl md:text-2xl font-headline font-black text-on-surface">
                    {labelsMap.editProfileTitle}
                  </h3>
                  <button
                    onClick={() => setIsEditingModalOpen(false)}
                    className="p-1 hover:bg-surface-container-highest rounded-lg text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <Icon name="close" />
                  </button>
                </div>
                
                <form onSubmit={handleSaveProfile} className="space-y-4 md:space-y-5">
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-label text-on-surface-variant font-bold mb-1.5 md:mb-2">
                      {labelsMap.name} *
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder={labelsMap.name}
                      required
                      className="w-full bg-surface-container-highest border border-outline-variant/20 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl p-3 text-on-surface text-sm transition-all outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-label text-on-surface-variant font-bold mb-1.5 md:mb-2">
                      {labelsMap.email}
                    </label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full bg-surface-container-highest border border-outline-variant/20 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl p-3 text-on-surface text-sm transition-all outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest font-label text-on-surface-variant font-bold mb-1.5 md:mb-2">
                      {labelsMap.roleLabel}
                    </label>
                    <input
                      type="text"
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      placeholder={isPt ? "Ex: Vocalista / Guitarrista" : "e.g., Lead Vocalist / Guitarist"}
                      className="w-full bg-surface-container-highest border border-outline-variant/20 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl p-3 text-on-surface text-sm transition-all outline-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-outline-variant/10">
                    <button
                      type="button"
                      onClick={() => setIsEditingModalOpen(false)}
                      className="flex-1 py-3 bg-surface-container-highest text-on-surface-variant font-label text-xs md:text-sm font-bold uppercase tracking-widest hover:bg-surface-container-highest/80 rounded-xl transition-all active:scale-[0.98]"
                    >
                      {labelsMap.cancel}
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-primary text-on-primary font-label text-xs md:text-sm font-bold uppercase tracking-widest hover:bg-primary/90 rounded-xl transition-all active:scale-[0.98] shadow-md hover:shadow-primary/20"
                    >
                      {labelsMap.save}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- Manual de Uso Component ---

const ManualModal = ({ isOpen, onClose, language }: { isOpen: boolean, onClose: () => void, language: Language }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'library' | 'import' | 'youtube' | 'editor' | 'setlists' | 'live' | 'data'>('general');
  const isPt = language.startsWith('pt');

  const tabs = [
    { id: 'general', label: isPt ? 'Geral' : 'General', icon: 'info' },
    { id: 'library', label: isPt ? 'Biblioteca & Filtros' : 'Library & Filters', icon: 'library_music' },
    { id: 'import', label: isPt ? 'Importar & PDFs' : 'Importing & PDFs', icon: 'cloud_upload' },
    { id: 'youtube', label: isPt ? 'YouTube & Mídias' : 'YouTube & Media', icon: 'smart_display' },
    { id: 'editor', label: isPt ? 'Formatando Cifras' : 'ChordPro Editor', icon: 'edit' },
    { id: 'setlists', label: isPt ? 'Repertórios' : 'Setlists', icon: 'format_list_bulleted' },
    { id: 'live', label: isPt ? 'No Palco (Show)' : 'Live & Performance', icon: 'play_circle' },
    { id: 'data', label: isPt ? 'Dados & Backup' : 'Data & Backup', icon: 'settings' },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[150]"
          />

          {/* Dialog Container */}
          <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 z-[160] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-4xl h-[90vh] sm:h-[80vh] bg-surface-container rounded-3xl border border-outline-variant/15 shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
            >
              {/* Header */}
              <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
                    <Icon name="auto_stories" className="text-xl" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-2xl font-headline font-black text-on-surface mt-0.5">
                      {isPt ? 'Manual de Uso' : 'User Manual'}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-on-surface-variant font-label uppercase tracking-wider">
                      {isPt ? 'Lyra Chords - Console de Performance' : 'Lyra Chords - Performance Guide'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-surface-container-highest rounded-xl text-on-surface-variant hover:text-on-surface transition-colors active:scale-95 flex items-center justify-center"
                >
                  <Icon name="close" />
                </button>
              </div>

              {/* Main Body */}
              <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-background/40">
                {/* Horizontal navigation on mobile / Desktop sidebar menu */}
                <div className="md:w-64 border-b md:border-b-0 md:border-r border-outline-variant/10 p-3 flex-shrink-0 bg-surface-container-low/50 overflow-x-auto md:overflow-y-auto scrollbar-none flex md:flex-col gap-1.5 scroll-smooth">
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold font-label uppercase tracking-wide transition-all whitespace-nowrap md:whitespace-normal text-left md:w-full active:scale-[0.98] leading-tight flex-shrink-0 md:flex-shrink",
                          isActive
                            ? "bg-primary text-on-primary shadow-md shadow-primary/20"
                            : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest"
                        )}
                      >
                        <Icon name={tab.icon} className={cn("text-lg flex-shrink-0", isActive ? "scale-110" : "opacity-75")} />
                        <span className="truncate md:overflow-visible md:whitespace-normal md:text-xs lg:text-xs xl:text-sm">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab content panel */}
                <div className="flex-1 p-5 sm:p-8 overflow-y-auto text-on-surface">
                  {activeTab === 'general' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 sm:p-5 flex gap-4 items-start">
                        <Icon name="waving_hand" className="text-primary text-3xl flex-shrink-0 animate-bounce" />
                        <div>
                          <h4 className="font-headline font-bold text-base sm:text-lg text-primary mb-1">
                            {isPt ? 'Bem-vindo ao Lyra Chords!' : 'Welcome to Lyra Chords!'}
                          </h4>
                          <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                            {isPt
                              ? 'Desenvolvido sob medida para músicos exigentes. Simplifique sua rotina organizando suas cifras, partituras e guias sonoras de maneira profissional e sem interrupções nos shows, ensaios ou estudos com suporte offline completo.'
                              : 'Tailored for professional musicians. Simplify your routine by organizing sheets, audio helpers, and layouts cleanly without any pain during live shows, rehearsals, or study sessions with full offline support.'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h5 className="font-headline font-black text-sm uppercase tracking-wider text-on-surface-variant">
                          {isPt ? 'Recursos Principais' : 'Core Key Features'}
                        </h5>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <li className="bg-surface-container-low border border-outline-variant/10 p-3.5 rounded-2xl flex gap-3 items-start">
                            <span className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center text-secondary font-bold text-xs flex-shrink-0 mt-0.5">1</span>
                            <div>
                              <strong className="block text-xs sm:text-sm font-bold text-on-surface mb-0.5">{isPt ? 'Pesquise e Crie' : 'Build & Check'}</strong>
                              <span className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">{isPt ? 'Procure músicas por filtros ou gênero nas abas principais, favorite-as e gerencie sua biblioteca.' : 'Search songs across the directory easily using labels, genres, or filter metrics.'}</span>
                            </div>
                          </li>
                          <li className="bg-surface-container-low border border-outline-variant/10 p-3.5 rounded-2xl flex gap-3 items-start">
                            <span className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center text-secondary font-bold text-xs flex-shrink-0 mt-0.5">2</span>
                            <div>
                              <strong className="block text-xs sm:text-sm font-bold text-on-surface mb-0.5">{isPt ? 'Importações Inteligentes' : 'Smart Imports'}</strong>
                              <span className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">{isPt ? 'Importe cifras via link da internet, faça upload de arquivos PDF para converter texto ou gerenciar partituras visuais facilmente.' : 'Upload chord sheets via URLs from major portal links, scan text PDFs or save visual musical scores.'}</span>
                            </div>
                          </li>
                          <li className="bg-surface-container-low border border-outline-variant/10 p-3.5 rounded-2xl flex gap-3 items-start">
                            <span className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center text-secondary font-bold text-xs flex-shrink-0 mt-0.5">3</span>
                            <div>
                              <strong className="block text-xs sm:text-sm font-bold text-on-surface mb-0.5">{isPt ? 'Modo de Palco & Áudio' : 'Performance Console & Audio'}</strong>
                              <span className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">{isPt ? 'Toque com rolagem automática, transposição dinâmica, metrônomo interativo e faixas de playback do YouTube em background.' : 'Play along with autoscroll, micro transposition, acoustic clicking metronome, and background YouTube references.'}</span>
                            </div>
                          </li>
                          <li className="bg-surface-container-low border border-outline-variant/10 p-3.5 rounded-2xl flex gap-3 items-start">
                            <span className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center text-secondary font-bold text-xs flex-shrink-0 mt-0.5">4</span>
                            <div>
                              <strong className="block text-xs sm:text-sm font-bold text-on-surface mb-0.5">{isPt ? 'Banco Totalmente Local' : 'Local Offline Engine'}</strong>
                              <span className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">{isPt ? 'As cifras ficam guardadas unicamente no seu navegador, funcionando 100% offline. Livre-se da dependência de internet no palco.' : 'Fully local engine runs safely offline. Your chords are preserved from connections outages during gigs.'}</span>
                            </div>
                          </li>
                        </ul>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'library' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <h4 className="font-headline font-black text-lg text-primary border-b border-outline-variant/10 pb-2">
                        {isPt ? 'Gerenciando Músicas & Filtros' : 'Managing Songs & Lists Filters'}
                      </h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed font-body">
                        {isPt
                          ? 'Encontrar suas cifras na velocidade certa é crucial no palco ou ensaios.'
                          : 'A quick response directory search allows immediate responses during chaotic live setups.'}
                      </p>

                      <div className="space-y-4">
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="search" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Busca Instantânea por Texto' : 'Instant Search Input'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Digite termos do título ou do artista na barra superior do aplicativo. O filtro responde instantaneamente com as músicas correspondentes em tempo de digitação.'
                                : 'Simply enter any part of the composer or song name inside the search bar. Matches pop up instantly.'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center flex-shrink-0">
                            <Icon name="favorite" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Favoritando Acordes' : 'Favorite Lists'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Toque no ícone de canção favorita para classificar músicas rápidas. No filtro principal, selecione "Favorito" para exibir apenas suas canções marcadas.'
                                : 'Star or heart core sheets to build your list of go-to melodies. Filter to view only favorited ones.'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="swap_vert" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Sistemas de Ordenações Inteligentes' : 'Dynamic Sort Indexes'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'No seletor de filtros do topo da biblioteca, troque entre a ordem alfabética "A-Z", "Z-A" ou exiba por ordem de edição com o modo "Recentes".'
                                : 'Keep catalogs perfectly arranged. Toggle indexing values with alphabetical filters (A-Z / Z-A) or edit dates (Recent).'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'import' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <h4 className="font-headline font-black text-lg text-primary border-b border-outline-variant/10 pb-2">
                        {isPt ? 'Importar Cifras via Link, PDFs e Partituras' : 'How to Import via Link, PDFs, and Scores'}
                      </h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed font-body">
                        {isPt
                          ? 'O Lyra Chords elimina o trabalho manual! Você pode trazer suas músicas de sites conhecidos ou digitalizar documentos em segundos.'
                          : 'Lyra Chords cuts manual compilation tasks. Rapidly capture songs from famous web catalogs or scan static document pages.'}
                      </p>

                      <div className="space-y-4">
                        {/* 1. IMPORTAR POR LINK */}
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 space-y-3 shadow-sm">
                          <div className="flex gap-3.5 items-center">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center flex-shrink-0">
                              <Icon name="link" className="text-xl" />
                            </div>
                            <h5 className="font-bold text-base text-on-surface">
                              {isPt ? '1. Importar por Link (Cifra Club, Cifras.com.br, etc.)' : '1. Import via Link (Cifra Club, etc.)'}
                            </h5>
                          </div>
                          <p className="text-xs text-on-surface-variant leading-relaxed pl-1.5 border-l-2 border-primary/20">
                            {isPt
                              ? 'Nossa engine inteligente faz o "scraping" automático de acordes e letras de portais populares da web.'
                              : 'Our internal scraper parses chords and lyrics layouts cleanly from popular chords directories.'}
                          </p>
                          <div className="bg-surface-container-highest/60 p-3 rounded-xl space-y-2">
                            <strong className="block text-[11px] uppercase tracking-wider text-primary font-label">{isPt ? 'Como fazer passo a passo:' : 'Step By Step:'}</strong>
                            <ol className="text-xs space-y-1.5 list-decimal list-inside text-on-surface-variant leading-relaxed">
                              <li>{isPt ? 'Navegue em seu navegador e acesse a cifra que deseja do Cifra Club, Cifras.com.br, etc.' : 'Search for a song in your web browser of choice.'}</li>
                              <li>{isPt ? 'Copie o endereço da barra de URLs completo (ex: https://www.cifraclub.com.br/gloria-a-deus/).' : 'Copy the absolute page link (e.g., https://www.cifraclub.com.br/gloria-a-deus/).'}</li>
                              <li>{isPt ? 'Abra a Biblioteca do Lyra Chords, toque no botão de "+" (ou Ferramentas) no canto superior e selecione "Importar via Link".' : 'Inside Lyra Chords Library, open imports and select "Import via Link".'}</li>
                              <li>{isPt ? 'Cole o link copiado na caixa de entrada e clique em "Importar". Pronto! Os acordes serão decodificados no formato interativo do app.' : 'Paste the link and tap "Import". Chords will instantly structure into the performance layout.'}</li>
                            </ol>
                          </div>
                        </div>

                        {/* 2. IMPORTAR PDF COM IA */}
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 space-y-3 shadow-sm">
                          <div className="flex gap-3.5 items-center">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center flex-shrink-0">
                              <Icon name="picture_as_pdf" className="text-xl" />
                            </div>
                            <h5 className="font-bold text-base text-on-surface">
                              {isPt ? '2. Importar via PDF com IA (Extração de Texto)' : '2. Import Text PDFs with AI scanning'}
                            </h5>
                          </div>
                          <p className="text-xs text-on-surface-variant leading-relaxed pl-1.5 border-l-2 border-primary/20">
                            {isPt
                              ? 'Caso você tenha arquivos de cifras salvos em PDF, nossa Inteligência Artificial integrada lê as folhas, separa estrofes e posiciona os acordes.'
                              : 'Upload dry PDFs containing text cords. Our integrated model isolates columns and registers brackets.'}
                          </p>
                          <div className="bg-surface-container-highest/60 p-3 rounded-xl space-y-2">
                            <strong className="block text-[11px] uppercase tracking-wider text-primary font-label">{isPt ? 'Como fazer passo a passo:' : 'Step By Step:'}</strong>
                            <ol className="text-xs space-y-1.5 list-decimal list-inside text-on-surface-variant leading-relaxed">
                              <li>{isPt ? 'Na Biblioteca, clique em "+" e marque "Importar via PDF".' : 'Open the importer dialog and click "Import via PDF".'}</li>
                              <li>{isPt ? 'Clique para fazer o upload do documento PDF salvo no celular.' : 'Select and load your saved file from storage drives.'}</li>
                              <li>{isPt ? 'A IA analisará o layout de texto. Em instantes, a música é salva montada sob o formato de leitura limpo.' : 'The engine interprets lyrics blocks and positions chords inside brackets instantly.'}</li>
                            </ol>
                          </div>
                        </div>

                        {/* 3. SALVAR PARTITURAS EM PDF */}
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 space-y-3 shadow-sm">
                          <div className="flex gap-3.5 items-center">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center flex-shrink-0">
                              <Icon name="menu_book" className="text-xl" />
                            </div>
                            <h5 className="font-bold text-base text-on-surface">
                              {isPt ? '3. Salvar e Ler Partituras (PDF Visual do Papel)' : '3. Save & Read Sheet Music (Visual PDF scores)'}
                            </h5>
                          </div>
                          <p className="text-xs text-on-surface-variant leading-relaxed pl-1.5 border-l-2 border-primary/20">
                            {isPt
                              ? 'Perfeito para maestros, tecladistas ou violonistas que preferem ler a pauta/tablatura gráfica original em vez de cifras comuns.'
                              : 'Ideal for visual-centric performances requiring original sheets or graphical guidelines.'}
                          </p>
                          <div className="bg-surface-container-highest/60 p-3 rounded-xl space-y-2">
                            <strong className="block text-[11px] uppercase tracking-wider text-primary font-label">{isPt ? 'Como fazer passo a passo:' : 'Step By Step:'}</strong>
                            <ol className="text-xs space-y-1.5 list-decimal list-inside text-on-surface-variant leading-relaxed">
                              <li>{isPt ? 'No seletor de importação, escolha "Importar Partitura".' : 'Under the additions layout, choose "Import Sheet Music" option.'}</li>
                              <li>{isPt ? 'Faça upload do PDF de pentagrama, partitura gráfica de piano/bateria ou tablatura.' : 'Upload the graphical layout sheets or piano/drum pdf sheets.'}</li>
                              <li>{isPt ? 'Nomeie a canção e o artista para arquivar seu sumário.' : 'Input the artist, track title and save.'}</li>
                              <li>{isPt ? 'Ao abrir a música no Palco, o Lyra Chords renderizará o PDF original em uma tela dedicada de visualização com zoom flutuante e rolagem suave!' : 'Opening the item initiates a professional file rendering page allowing real-time pinch/zoom adjustments directly on stage.'}</li>
                            </ol>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'youtube' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <h4 className="font-headline font-black text-lg text-primary border-b border-outline-variant/10 pb-2">
                        {isPt ? 'Integração com YouTube (Vídeos e Áudios)' : 'YouTube Integration (Audio & Videos)'}
                      </h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed font-body">
                        {isPt
                          ? 'Estude e ensaie no tempo certo integrando faixas acústicas de referência ou guias em vídeo do YouTube diretamente com suas letras.'
                          : 'Rehearse on pitch. Bind actual recordings, study files, or video references with your sheets.'}
                      </p>

                      <div className="space-y-4">
                        {/* 1. SALVAR LINK */}
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 space-y-3 shadow-sm">
                          <div className="flex gap-3.5 items-center">
                            <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-500 flex items-center justify-center flex-shrink-0">
                              <Icon name="add_to_photos" className="text-xl" />
                            </div>
                            <h5 className="font-bold text-base text-on-surface">
                              {isPt ? 'Como Salvar e Vincular Vídeos do YouTube' : 'How to Bind YouTube Video Links'}
                            </h5>
                          </div>
                          <div className="bg-surface-container-highest/60 p-3 rounded-xl space-y-2">
                            <strong className="block text-[11px] uppercase tracking-wider text-primary font-label">{isPt ? 'Passo a Passo:' : 'Step By Step:'}</strong>
                            <ol className="text-xs space-y-1.5 list-decimal list-inside text-on-surface-variant leading-relaxed">
                              <li>{isPt ? 'Vá no YouTube, procure pela faixa correspondente com o áudio ou vídeo de referência.' : 'Find the matching reference video or backing track on YouTube.'}</li>
                              <li>{isPt ? 'Copie o link padrão de compartilhamento (ex: https://www.youtube.com/watch?v=XXXX ou https://youtu.be/XXXX).' : 'Copy the browser URL or the video share link.'}</li>
                              <li>{isPt ? 'No Lyra Chords, acesse o editor de sua música (criar ou editar) e cole esse link no campo vermelho "Link do Vídeo no YouTube".' : 'Open your Lyra Chords song editor, locate the red input labeled "YouTube Video Link", and paste.'}</li>
                              <li>{isPt ? 'Clique em "Salvar" no fim do formulário. A conexão está criada e vinculada para sempre!' : 'Tap "Save". The video is permanently linked to your chord sheet!'}</li>
                            </ol>
                          </div>
                        </div>

                        {/* 2. PLAYER DE BACKSTAGE */}
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 space-y-3 shadow-sm">
                          <div className="flex gap-3.5 items-center">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center flex-shrink-0">
                              <Icon name="music_note" className="text-xl" />
                            </div>
                            <h5 className="font-bold text-base text-on-surface">
                              {isPt ? 'Tocando o Áudio de Fundo (Backing Tracks)' : 'Playing Audio Background references'}
                            </h5>
                          </div>
                          <p className="text-xs text-on-surface-variant leading-relaxed">
                            {isPt
                              ? 'Ao abrir a música no Palco para tocar, o botão "YouTube" ficará habilitado sob o cabeçalho. Ao ser clicado, ele inicia a faixa de áudio discretamente. O reprodutor oculto no rodapé permite controles de reprodução (Play, Pause, Progressão) sem poluir seu espaço de acordes.'
                              : 'Linked songs showcase a dynamic launch button. Load backing tracks instantly. Tap play or seek via the integrated audio console located at the bottom bar.'}
                          </p>
                        </div>

                        {/* 3. FLUTUADOR */}
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 space-y-3 shadow-sm">
                          <div className="flex gap-3.5 items-center">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center flex-shrink-0">
                              <Icon name="visibility" className="text-xl" />
                            </div>
                            <h5 className="font-bold text-base text-on-surface">
                              {isPt ? 'Assistindo ao Guia de Dedilhado/Video Aula' : 'Watching Tutorial Videos Screen-In-Screen'}
                            </h5>
                          </div>
                          <p className="text-xs text-on-surface-variant leading-relaxed">
                            {isPt
                              ? 'Precisa checar as posições dedilhadas ou o compasso em vídeo? Clique no ícone de "Olho" no painel de mídia do rodapé. Um frame flutuante em canto de tela carregará a tela de vídeo do YouTube, permitindo acompanhar o tutorial simultaneamente com a cifra. Desative ou esconda com um simples clique para voltar ao show.'
                              : 'Need visual instruction overlays? Click the camera eye icon toggler to activate a screen-in-screen video layout inside Lyra Chords.'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'editor' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <h4 className="font-headline font-black text-lg text-primary border-b border-outline-variant/10 pb-2">
                        {isPt ? 'Como Escrever e Formatar Cifras' : 'How to Write & Format Chords'}
                      </h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed font-body">
                        {isPt
                          ? 'O Lyra Chords usa o prático formato ChordPro. Ele permite colocar os acordes embutidos diretamente entre colchetes na letra da canção.'
                          : 'Lyra Chords interprets the standard industrial ChordPro schema, automatically hoisting bracket-enclosed chords above the matching syllables.'}
                      </p>

                      <div className="bg-surface-container-low/80 p-5 rounded-2xl border border-outline-variant/10 space-y-3.5 shadow-sm">
                        <h5 className="font-mono text-xs font-semibold text-secondary uppercase tracking-widest">
                          {isPt ? 'Exemplo de escrita no editor:' : 'Raw syntax in the editor:'}
                        </h5>
                        <div className="bg-surface-container-highest p-4 rounded-xl font-mono text-xs text-on-surface-variant leading-relaxed border border-outline-variant/15">
                          [G]Deus enviou Seu [C]filho amado<br />
                          Pra nos sal[G]var, pra nos re[D]mir
                        </div>

                        <Icon name="arrow_downward" className="text-primary text-xl mx-auto block" />

                        <h5 className="font-mono text-xs font-semibold text-primary uppercase tracking-widest">
                          {isPt ? 'Visualização Renderizada no Palco:' : 'As rendered live on the stage:'}
                        </h5>
                        <div className="bg-surface-container-highest p-4 rounded-xl space-y-3 border border-outline-variant/15 text-sm">
                          <div className="leading-8">
                            <span className="inline-block relative mr-1"><span className="absolute -top-5 left-0 text-xs font-mono font-bold text-primary select-none">G</span>Deus</span> enviou Seu 
                            <span className="inline-block relative mx-1"><span className="absolute -top-5 left-0 text-xs font-mono font-bold text-primary select-none">C</span>filho</span> amado
                          </div>
                          <div className="leading-8">
                            Pra nos sal<span className="inline-block relative mx-1"><span className="absolute -top-5 left-0 text-xs font-mono font-bold text-primary select-none">G</span>var</span>, pra nos re<span className="inline-block relative mx-1"><span className="absolute -top-5 left-0 text-xs font-mono font-bold text-primary select-none">D</span>mir</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-secondary/5 border border-secondary/15 rounded-2xl p-4 flex gap-3.5 items-start">
                        <Icon name="lightbulb" className="text-secondary text-2xl flex-shrink-0 animate-pulse" />
                        <div>
                          <h6 className="font-bold text-xs sm:text-sm text-on-surface mb-0.5">{isPt ? 'Vantagem da escrita Inline' : 'Metadata tagging'}</h6>
                          <p className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
                            {isPt
                              ? 'O sistema inteligente do app reconhece e calcula transposições de tom automaticamente! Se você transpor uma música, o aplicativo substitui todas as marcas de [G], [C] para novas notas ajustadas sem bagunçar a letra.'
                              : 'Dynamic transpositions keep chord shapes inline. Changes recalculate automatically with proper chord steps.'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'setlists' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <h4 className="font-headline font-black text-lg text-primary border-b border-outline-variant/10 pb-2">
                        {isPt ? 'Organizando Repertórios (Setlists)' : 'Organizing Setlists (Playlists)'}
                      </h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed font-body">
                        {isPt
                          ? 'Planeje shows ou ensaios arranjando canções em trilhas pré-ordenadas.'
                          : 'Compose song queues to manage stage schedules, tempos, and seamless track-to-track transitions.'}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 text-center shadow-sm">
                          <Icon name="playlist_add" className="text-secondary text-2xl mb-2" />
                          <h5 className="font-bold text-sm mb-1">{isPt ? 'Passo 1: Criar' : '1: Compose'}</h5>
                          <p className="text-[11px] text-on-surface-variant leading-relaxed">{isPt ? 'Clique em Novo Repertório, dê um nome, e escolha uma categoria (Visual, Ensaio, Prática).' : 'Tap to start a setlist, write description notes and select tags.'}</p>
                        </div>
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 text-center shadow-sm">
                          <Icon name="drag_handle" className="text-primary text-2xl mb-2" />
                          <h5 className="font-bold text-sm mb-1">{isPt ? 'Passo 2: Ordenar' : '2: Arrange'}</h5>
                          <p className="text-[11px] text-on-surface-variant leading-relaxed">{isPt ? 'As músicas podem ser facilmente movidas de lugar usando o arrastador lateral na lista.' : 'Manage track progression. Drag songs to make transition sets seamless.'}</p>
                        </div>
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 text-center shadow-sm">
                          <Icon name="play_circle" className="text-error text-2xl mb-2" />
                          <h5 className="font-bold text-sm mb-1">{isPt ? 'Passo 3: Tocar' : '3: Perform'}</h5>
                          <p className="text-[11px] text-on-surface-variant leading-relaxed">{isPt ? 'Adicione tudo e abra a lista direto na tela de show. Navegue com setas ou gestos.' : 'Open directly from the dashboard and proceed with swipe navigations.'}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'live' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <h4 className="font-headline font-black text-lg text-primary border-b border-outline-variant/10 pb-2">
                        {isPt ? 'Ferramentas de Palco (Modo Performance)' : 'Live Stage Performance Panel Tools'}
                      </h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed font-body">
                        {isPt
                          ? 'A tela de performance é uma verdadeira central de controle para o instrumentista ao vivo.'
                          : 'The live performance screen is a master hub designed specifically to assist you under stage pressure.'}
                      </p>

                      <div className="space-y-4">
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="speed" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Rolagem Automática (Auto-Scroll)' : 'Smart Speed Autoscrolling'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Deixe de lado o celular ou apoios para rolagem! Controle a velocidade ideal de descida da tela. Pare, reinicie ou acelere de acordo com o ritmo da canção.'
                                : 'Play hands-free. Speed bars let you configure the flow speed matching standard vertical lyric scrolling.'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-505 flex items-center justify-center flex-shrink-0">
                            <Icon name="tune" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Transpositor de Meio-Tom Inteligente' : 'Adaptive Transposing (+/-)'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Use os botões de controle de tom para transpor toda a harmonia do acorde em semitons! Perfeito para vocalistas que precisam ajustar uma nota num tom apertado.'
                                : 'Shift keys in raw half-steps. Calculations automatically realign complex harmonies instantly.'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="metronome" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Metrônomo Visor & Áudio' : 'Built-in Metronome'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Disponível no painel superior do palco. Ele oferece referências visuais piscantes e sonoras baseadas na taxa de BPM salva para marcar tempos e síncopes.'
                                : 'Sync rhythm visually and acoustically. Features visual cues and click notes matching the set BPM on settings.'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="adjust" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Calculadora de Capotraste (Capo)' : 'Capotasto Dynamic Assistant'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Defina a casa do capo (ex: 3ª casa). Os acordes originais serão calculados em posições de formas adaptadas automaticamente para facilitar sua dedilha.'
                                : 'Calculate relative capo indices and chord positions instantly. Great for adjusting to dynamic guitar requirements.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'data' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <h4 className="font-headline font-black text-lg text-primary border-b border-outline-variant/10 pb-2">
                        {isPt ? 'Backups, Dados & Segurança' : 'System Preferences, Backups & Data'}
                      </h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed font-body">
                        {isPt
                          ? 'O Lyra Chords oferece controle absoluto para salvar, recuperar ou importar seu repertório.'
                          : 'Your tracks are totally yours. Load or write complete library directories and restore variables cleanly.'}
                      </p>

                      <div className="space-y-4">
                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="download" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Exportar Todos os Dados (Backup)' : 'Export Full JSON Backup'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Vá em Configurações > Toque em Exportar Dados para gerar um backup completo (.json) com todas as músicas, setlists e definições. Salve-o na nuvem ou PC.'
                                : 'Download a unified catalog file. This keeps your records safe for transitions to other platforms.'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex gap-4 items-start shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="upload_file" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-on-surface mb-1">{isPt ? 'Importar Dados de Volta' : 'Restore / Load Backup'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Importar é rápido. Basta escolher seu arquivo .json de backup para recarregar sua biblioteca completa no celular de outro membro ou no seu computador!'
                                : 'Simply select and load your saved JSON file to instantly rebuild all catalogs, setlists, and app variables.'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-red-500/5 p-4 rounded-2xl border border-red-500/10 flex gap-4 items-start">
                          <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="delete_forever" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-red-400 mb-1">{isPt ? 'Limpar Banco de Dados' : 'Reset Platform Storage'}</h5>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {isPt
                                ? 'Se você preferir limpar dados de testes e redefinir o Lyra Chords ao estado inicial, use a ferramenta "Redefinir Todas as Configurações" com cautela nas Configurações.'
                                : 'A master wipe tool handles raw browser cleanup. Use extreme caution since this cannot be reversed.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 sm:p-5 border-t border-outline-variant/10 flex justify-between items-center bg-surface-container-low bg-gradient-to-r from-surface-container-low to-primary/5">
                <span className="font-mono text-[9px] sm:text-[10px] tracking-wider text-on-surface-variant/60 uppercase">
                  {isPt ? 'Lyra Chords v2.4.0 — O melhor parceiro do instrumentista' : 'Lyra Chords v2.4.0 — The musician\'s ultimate partner'}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/95 text-on-primary font-label text-xs font-bold uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] shadow-md shadow-primary/10"
                >
                  {isPt ? 'Entendi' : 'Understood'}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// --- Sidebar Component ---

const Sidebar = ({ isOpen, onClose, language, userProfile, onOpenManual }: { isOpen: boolean, onClose: () => void, language: Language, userProfile: UserProfile, onOpenManual: () => void }) => {
  const navigate = useNavigate();
  const t = useTranslation(language);
  const menuItems = [
    { icon: 'account_circle', label: t.profile, path: '/profile' },
    { icon: 'library_music', label: t.library, path: '/' },
    { icon: 'format_list_bulleted', label: t.setlists, path: '/setlists' },
    { icon: 'settings', label: t.settings, path: '/settings' },
    { icon: 'help', label: t.help_support, path: '/help' },
    { icon: 'logout', label: t.logout, path: '/logout' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />
          {/* Sidebar Content */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-72 sm:w-80 bg-surface-container-low border-r border-outline-variant/10 z-[70] shadow-2xl flex flex-col"
          >
            <div className="p-6 md:p-8 border-b border-outline-variant/10">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <Icon name="account_circle" className="text-3xl" />
                </div>
                <div>
                  <h3 className="font-headline font-black text-xl text-on-surface">{userProfile.name}</h3>
                  <p className="font-label text-xs text-on-surface-variant uppercase tracking-widest">{userProfile.role || t.premium_musician}</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 py-4 md:py-6 px-3 md:px-4 space-y-2">
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    if (item.path === '/help') {
                      onOpenManual();
                    } else {
                      navigate(item.path);
                    }
                    onClose();
                  }}
                  className="w-full flex items-center gap-4 px-3 md:px-4 py-3 md:py-4 rounded-xl hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-all group"
                >
                  <Icon name={item.icon} className="group-hover:scale-110 transition-transform" />
                  <span className="font-label text-sm font-bold uppercase tracking-widest">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="p-8 border-t border-outline-variant/10">
              <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant opacity-40">{t.performance_console} v2.4.0</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// --- App Component ---

const DEFAULT_SETTINGS: PerformanceSettings = {
  fontSize: 28,
  chordColor: '#00E676',
  lyricColor: '#FFFFFF',
  autoTranspose: true,
  visualClick: false,
  theme: 'dark',
  language: 'en-US',
  streamingAccounts: [
    { id: 'youtube', name: 'YouTube', connected: false },
  ]
};

export default function App() {
  const [songs, setSongs] = useState<Song[]>(() => storage.loadSongs() || MOCK_SONGS);
  const [setlists, setSetlists] = useState<Setlist[]>(() => storage.loadSetlists() || MOCK_SETLISTS);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    return storage.loadProfile() || {
      name: 'Paulo José',
      email: 'paulojosemitz@gmail.com',
      role: 'Premium Musician',
      memberSince: 'March 2024',
      subscription: 'Pro Annual'
    };
  });
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>(() => {
    const loaded = storage.loadSettings();
    if (loaded && loaded.streamingAccounts) {
      const filtered = loaded.streamingAccounts
        .filter(a => a.id === 'youtube')
        .map(a => ({ ...a, name: 'YouTube' as const }));
      return { ...loaded, streamingAccounts: filtered };
    }
    return loaded || DEFAULT_SETTINGS;
  });

  // Persistence Effects
  useEffect(() => {
    storage.saveSongs(songs);
  }, [songs]);

  useEffect(() => {
    storage.saveSetlists(setlists);
  }, [setlists]);

  useEffect(() => {
    storage.saveSettings(performanceSettings);
  }, [performanceSettings]);

  useEffect(() => {
    storage.saveProfile(userProfile);
  }, [userProfile]);

  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (theme: 'light' | 'dark') => {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    };

    if (performanceSettings.theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(systemTheme);

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      applyTheme(performanceSettings.theme);
    }
  }, [performanceSettings.theme]);



  const addSong = (song: Omit<Song, 'id'>) => {
    const newSong = { ...song, id: Math.random().toString(36).substr(2, 9) };
    setSongs([...songs, newSong]);
  };

  const updateSong = (updatedSong: Song) => {
    setSongs(songs.map(s => s.id === updatedSong.id ? updatedSong : s));
  };

  const deleteSong = (id: string) => {
    setSongs(songs.filter(s => s.id !== id));
    // Also remove from setlists
    setSetlists(setlists.map(sl => ({
      ...sl,
      songs: sl.songs.filter(sid => sid !== id)
    })));
  };

  const toggleFavorite = (id: string) => {
    setSongs(songs.map(s => s.id === id ? { ...s, isFavorite: !s.isFavorite } : s));
  };

  const saveSetlist = (setlist: Setlist) => {
    const exists = setlists.find(s => s.id === setlist.id);
    if (exists) {
      setSetlists(setlists.map(s => s.id === setlist.id ? setlist : s));
    } else {
      setSetlists([setlist, ...setlists]);
    }
  };

  const deleteSetlist = (id: string) => {
    setSetlists(setlists.filter(s => s.id !== id));
  };

  return (
    <Router>
      <AppContent 
        songs={songs} 
        setlists={setlists} 
        editingSong={editingSong} 
        setEditingSong={setEditingSong}
        addSong={addSong}
        updateSong={updateSong}
        deleteSong={deleteSong}
        toggleFavorite={toggleFavorite}
        saveSetlist={saveSetlist}
        deleteSetlist={deleteSetlist}
        activeSetlistId={activeSetlistId}
        setActiveSetlistId={setActiveSetlistId}
        performanceSettings={performanceSettings}
        setPerformanceSettings={setPerformanceSettings}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        onImportData={(data) => {
          setSongs(data.songs);
          setSetlists(data.setlists);
          setPerformanceSettings(data.settings);
        }}
      />
    </Router>
  );
}

function AppContent({ 
  songs, 
  setlists, 
  editingSong, 
  setEditingSong, 
  addSong, 
  updateSong, 
  deleteSong,
  toggleFavorite,
  saveSetlist,
  deleteSetlist,
  activeSetlistId,
  setActiveSetlistId,
  performanceSettings,
  setPerformanceSettings,
  userProfile,
  setUserProfile,
  onImportData
}: { 
  songs: Song[], 
  setlists: Setlist[], 
  editingSong: Song | null, 
  setEditingSong: (s: Song | null) => void,
  addSong: (s: Omit<Song, 'id'>) => void,
  updateSong: (s: Song) => void,
  deleteSong: (id: string) => void,
  toggleFavorite: (id: string) => void,
  saveSetlist: (s: Setlist) => void,
  deleteSetlist: (id: string) => void,
  activeSetlistId: string | null,
  setActiveSetlistId: (id: string | null) => void,
  performanceSettings: PerformanceSettings,
  setPerformanceSettings: (s: PerformanceSettings) => void,
  userProfile: UserProfile,
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>,
  onImportData: (data: { songs: Song[], setlists: Setlist[], settings: PerformanceSettings }) => void
}) {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const isPerformView = location.pathname.startsWith('/perform');
  const isEditView = location.pathname === '/edit-song' || location.pathname.startsWith('/setlists/edit') || location.pathname === '/setlists/new';

  return (
    <div className="min-h-screen bg-background text-on-background font-body">
      <Toaster position="top-center" richColors />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} language={performanceSettings.language} userProfile={userProfile} onOpenManual={() => setIsManualOpen(true)} />
      <ManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} language={performanceSettings.language} />
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<LibraryView songs={songs} onDelete={deleteSong} onEdit={setEditingSong} onToggleFavorite={toggleFavorite} onToggleSidebar={() => setIsSidebarOpen(true)} onAddSong={addSong} language={performanceSettings.language} />} />
          <Route path="/profile" element={<ProfileView songs={songs} setlists={setlists} onToggleSidebar={() => setIsSidebarOpen(true)} language={performanceSettings.language} userProfile={userProfile} onUpdateProfile={setUserProfile} />} />
          <Route path="/setlists" element={<SetlistsView songs={songs} setlists={setlists} onDeleteSetlist={deleteSetlist} activeSetlistId={activeSetlistId} setActiveSetlistId={setActiveSetlistId} onToggleSidebar={() => setIsSidebarOpen(true)} language={performanceSettings.language} />} />
          <Route path="/setlists/new" element={<SetlistEditorView songs={songs} setlists={setlists} onSave={saveSetlist} language={performanceSettings.language} />} />
          <Route path="/setlists/edit/:id" element={<SetlistEditorView songs={songs} setlists={setlists} onSave={saveSetlist} language={performanceSettings.language} />} />
          <Route path="/perform/:id" element={<PerformView songs={songs} setlists={setlists} settings={performanceSettings} onUpdateSettings={setPerformanceSettings} onUpdateSong={updateSong} language={performanceSettings.language} />} />
          <Route path="/perform/setlist/:setlistId/:songIndex" element={<PerformView songs={songs} setlists={setlists} settings={performanceSettings} onUpdateSettings={setPerformanceSettings} onUpdateSong={updateSong} language={performanceSettings.language} />} />
          <Route path="/perform" element={<PerformView songs={songs} setlists={setlists} settings={performanceSettings} onUpdateSettings={setPerformanceSettings} onUpdateSong={updateSong} language={performanceSettings.language} />} />
          <Route path="/settings" element={
            <SettingsView 
              settings={performanceSettings} 
              onUpdateSettings={setPerformanceSettings} 
              language={performanceSettings.language}
              onImportData={onImportData}
            />
          } />
          <Route path="/edit-song" element={<SongEditorView onSave={(s) => {
            if ('id' in s) updateSong(s as Song);
            else addSong(s);
          }} initialSong={editingSong} onCancel={() => setEditingSong(null)} language={performanceSettings.language} />} />
        </Routes>
      </AnimatePresence>
      {(!isPerformView && !isEditView) && <BottomNav language={performanceSettings.language} />}
    </div>
  );
}
