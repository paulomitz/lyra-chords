import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

let aiInstance: GoogleGenAI | null = null;
function getAi() {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Chave GEMINI_API_KEY não está definida no ambiente do servidor (.env). Adicione o token correspondente.");
    }
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Spotify OAuth Configuration
  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const REDIRECT_URI = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/spotify/callback`;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // 1. Get Spotify Auth URL
  app.get("/api/auth/spotify/url", (req, res) => {
    if (!SPOTIFY_CLIENT_ID) {
      return res.status(500).json({ error: "Spotify Client ID not configured" });
    }

    const scope = "user-read-private user-read-email user-modify-playback-state user-read-playback-state";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: SPOTIFY_CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
    });

    res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
  });

  // 2. Spotify Callback
  app.get("/api/auth/spotify/callback", async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: REDIRECT_URI,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
          },
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // Store tokens in secure cookies
      res.cookie("spotify_access_token", access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: expires_in * 1000,
      });

      if (refresh_token) {
        res.cookie("spotify_refresh_token", refresh_token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
      }

      // Send success message to parent window and close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'spotify' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Spotify OAuth Error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed");
    }
  });

  // 3. Check Spotify Auth Status
  app.get("/api/auth/spotify/status", (req, res) => {
    const token = req.cookies.spotify_access_token;
    res.json({ connected: !!token });
  });

  // 4. Logout Spotify
  app.post("/api/auth/spotify/logout", (req, res) => {
    res.clearCookie("spotify_access_token");
    res.clearCookie("spotify_refresh_token");
    res.json({ success: true });
  });

  // 5. Search Spotify Track
  app.get("/api/spotify/search", async (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (!token) {
      return res.status(401).json({ error: "Not connected to Spotify" });
    }

    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: "Query is required" });
    }

    let query = q as string;

    // Normalization for common artist name variations
    if (query.toLowerCase().includes("florianópolis house of prayer") || 
        query.toLowerCase().includes("florianopolis house of prayer")) {
      query = query.replace(/florianópolis house of prayer/gi, "FHOP Music")
                   .replace(/florianopolis house of prayer/gi, "FHOP Music");
    }

    try {
      const response = await axios.get("https://api.spotify.com/v1/search", {
        params: {
          q: query,
          type: "track",
          limit: 5,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const tracks = response.data.tracks.items.map((track: any) => ({
        id: track.id,
        title: track.name,
        artist: track.artists.map((a: any) => a.name).join(", "),
        album: track.album.name,
        coverUrl: track.album.images[0]?.url,
        uri: track.uri,
      }));

      res.json(tracks);
    } catch (error: any) {
      console.error("Spotify Search Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to search on Spotify" });
    }
  });

  // 6. Play Song on Spotify
  app.post("/api/spotify/play", async (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (!token) {
      return res.status(401).json({ error: "Not connected to Spotify" });
    }

    const { title, artist, uri } = req.body;
    let trackUri = uri;
    let externalUrl = "";

    if (!trackUri) {
      if (!title || !artist) {
        return res.status(400).json({ error: "Title and artist or URI are required" });
      }

      const cleanTitle = title.trim();
      let cleanArtist = artist.trim();

      // Normalization for common artist name variations
      if (cleanArtist.toLowerCase().includes("florianópolis house of prayer") || 
          cleanArtist.toLowerCase().includes("florianopolis house of prayer")) {
        cleanArtist = "FHOP Music";
      }

      try {
        // 1. Try strict search first
        let searchResponse = await axios.get("https://api.spotify.com/v1/search", {
          params: {
            q: `track:${cleanTitle} artist:${cleanArtist}`,
            type: "track",
            limit: 1,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        let tracks = searchResponse.data.tracks.items;

        // 2. If strict search fails, try a more relaxed search
        if (tracks.length === 0) {
          searchResponse = await axios.get("https://api.spotify.com/v1/search", {
            params: {
              q: `${cleanTitle} ${cleanArtist}`,
              type: "track",
              limit: 1,
            },
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          tracks = searchResponse.data.tracks.items;
        }

        if (tracks.length === 0) {
          return res.status(404).json({ error: "Track not found on Spotify" });
        }

        trackUri = tracks[0].uri;
        externalUrl = tracks[0].external_urls.spotify;
      } catch (error: any) {
        console.error("Spotify Search Error:", error.response?.data || error.message);
        return res.status(500).json({ error: "Failed to search on Spotify" });
      }
    } else {
      // If URI was provided, construct external URL just in case
      const trackId = trackUri.split(':').pop();
      externalUrl = `https://open.spotify.com/track/${trackId}`;
    }

    // Try to play the track (requires Spotify Premium and an active device)
    try {
      await axios.put(
        "https://api.spotify.com/v1/me/player/play",
        { uris: [trackUri] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      res.json({ success: true, message: "Playing on Spotify" });
    } catch (playError: any) {
      // If no active device, return the track URI so the client can open it
      if (playError.response?.status === 404) {
        return res.json({ 
          success: true, 
          message: "No active Spotify device found. Opening Spotify...",
          external_url: externalUrl 
        });
      }
      // Handle 403 (No Premium or restricted)
      if (playError.response?.status === 403) {
        return res.json({ 
          success: true, 
          message: "Spotify Premium required for automatic playback. Opening Spotify...",
          external_url: externalUrl 
        });
      }
      console.error("Spotify Play Error:", playError.response?.data || playError.message);
      res.status(500).json({ error: "Failed to play on Spotify" });
    }
  });

  // 7. import Song From URL via Gemini API
  app.post("/api/ai/import-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
      
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error("Import from URL Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to import song from URL via Gemini" });
    }
  });

  // 8. import Song From PDF via Gemini API
  app.post("/api/ai/import-pdf", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ error: "Base64 PDF content is required" });
      }
      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: pdfBase64,
              mimeType: "application/pdf"
            }
          },
          `Extract the song sheet details from this PDF.
          
          CRITICAL FORMATTING RULES:
          1. Extract all lyrics and chords from the pdf.
          2. The 'content' field MUST use INLINE CHORDS in brackets like [G#].
          3. NEVER put chords on a separate line above the lyrics.
          4. Place the chord bracket [C] exactly before the syllable where the chord change occurs.
          5. Use section headers on their own lines (e.g., Intro, Verse 1, Chorus, Bridge) WITHOUT brackets around the header name itself, unless it's a chord.
          6. If a line has only chords, format it like: [G#] [Fm] [C#] [Eb].
          7. Ensure the output is a clean string ready for display.
          8. Clean the 'title' and 'artist' fields: remove suffixes like "(Official Video)", "(Lyrics)", "(Live)", etc.
          
          Example:
          [G#] Midnight [Fm] calls [C#] the echo [Eb] falls
          
          I need: title, artist, key, bpm, timeSignature, content, genre, and tags.
          If some fields like bpm, key, timeSignature are missing or can't be guessed, predict appropriate defaults.`
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
      
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error("Import from PDF Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to import song from PDF via Gemini" });
    }
  });

  // 9. Reformat/Clean Chords via Gemini API
  app.post("/api/ai/clean", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }
      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Re-format this song content to use INLINE CHORDS in brackets like [G#].
        
        CRITICAL RULES:
        1. NEVER put chords on a separate line above the lyrics.
        2. Place the chord bracket [C] exactly before the syllable where the chord change occurs.
        3. Use section headers on their own lines (e.g., Intro, Verse 1, Chorus).
        4. If a line has only chords, format it like: [G#] [Fm] [C#] [Eb].
        5. Remove any extra text or formatting junk.
        
        Original Content:
        ${content}`,
      });
      
      let cleaned = response.text.trim();
      cleaned = cleaned.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
      res.json({ content: cleaned });
    } catch (error: any) {
      console.error("Clean Content Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to format content via Gemini" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
