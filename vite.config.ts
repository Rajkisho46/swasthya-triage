import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handleTriageProxyRequest } from './src/server/triageProxyHandler.ts'
import { handleVoiceProxyRequest } from './src/server/voiceProxyHandler.ts'
import { handleAuthLoginRequest } from './src/server/authProxyHandler.ts'

function triageProxyPlugin(): Plugin {
  return {
    name: 'triage-server-proxy',
    configureServer(server) {
      // Auth Login Endpoint handler
      server.middlewares.use('/api/auth/login', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }

        let bodyStr = '';
        req.on('data', (chunk) => {
          bodyStr += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = bodyStr ? JSON.parse(bodyStr) : {};
            const result = handleAuthLoginRequest(payload);
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, detail: 'Malformed JSON' }));
          }
        });
      });
      // Voice Transcribe Endpoint handler
      server.middlewares.use('/api/voice/transcribe', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        req.on('end', async () => {
          try {
            const rawBody = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || 'audio/webm';
            
            // Extract boundary if multipart/form-data
            let audioBuffer: Buffer = rawBody;
            let mimeType = 'audio/webm';
            let language = 'auto';
            let isDemo = false;

            if (contentType.includes('multipart/form-data')) {
              // Parse simple multipart or extract binary payload
              const boundaryMatch = contentType.match(/boundary=(?:["']?)([^"';]+)(?:["']?)/);
              if (boundaryMatch) {
                const boundary = boundaryMatch[1];
                const parts = rawBody.toString('binary').split(`--${boundary}`);
                for (const part of parts) {
                  if (part.includes('name="audio"')) {
                    const matchMime = part.match(/Content-Type:\s*([^\r\n]+)/i);
                    if (matchMime) mimeType = matchMime[1].trim();
                    const headerEnd = part.indexOf('\r\n\r\n');
                    if (headerEnd !== -1) {
                      const dataStr = part.slice(headerEnd + 4, part.lastIndexOf('\r\n'));
                      audioBuffer = Buffer.from(dataStr, 'binary');
                    }
                  } else if (part.includes('name="language"')) {
                    const headerEnd = part.indexOf('\r\n\r\n');
                    if (headerEnd !== -1) {
                      language = part.slice(headerEnd + 4, part.lastIndexOf('\r\n')).trim();
                    }
                  } else if (part.includes('name="is_demo"')) {
                    isDemo = true;
                  }
                }
              }
            }

            const result = await handleVoiceProxyRequest(audioBuffer, mimeType, language, isDemo);
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || 'Internal proxy error' }));
          }
        });
      });

      // Triage Structuring Endpoint handler
      server.middlewares.use('/api/triage', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }

        let bodyStr = '';
        req.on('data', (chunk) => {
          bodyStr += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = bodyStr ? JSON.parse(bodyStr) : {};
            const result = await handleTriageProxyRequest(payload);
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          } catch (err: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Malformed JSON payload' }));
          }
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/triage', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }

        let bodyStr = '';
        req.on('data', (chunk) => {
          bodyStr += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = bodyStr ? JSON.parse(bodyStr) : {};
            const result = await handleTriageProxyRequest(payload);
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          } catch (err: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Malformed JSON payload' }));
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), triageProxyPlugin()],
  server: {
    port: 5173,
    watch: {
      ignored: ['**/.git/**', '**/swasthya_triage.db*'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
