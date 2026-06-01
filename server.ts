import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

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
