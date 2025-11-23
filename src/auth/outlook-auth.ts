import http from 'http';
import fs from 'fs/promises';
import open from 'open';

const CLIENT_ID = process.env.OUTLOOK_CLIENT_ID || '';
const CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET || '';
const TENANT_ID = process.env.OUTLOOK_TENANT_ID || 'common';
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = ['Mail.Read', 'Mail.Send', 'Mail.ReadWrite', 'offline_access'];

async function setup() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET environment variables');
    process.exit(1);
  }

  const authUrl =
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES.join(' '))}&response_mode=query`;

  console.log('Opening browser for Microsoft login...');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:3000`);

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');

      if (code) {
        const tokenResponse = await fetch(
          `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              code,
              redirect_uri: REDIRECT_URI,
              grant_type: 'authorization_code',
            }),
          }
        );

        const data = await tokenResponse.json();

        const token = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
        };

        await fs.writeFile('./credentials/outlook-token.json', JSON.stringify(token, null, 2));

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Success! You can close this window.</h1>');

        console.log('Outlook token saved to credentials/outlook-token.json');
        server.close();
        process.exit(0);
      }
    }

    res.writeHead(400);
    res.end('Error');
  });

  server.listen(3000, () => {
    open(authUrl);
  });
}

setup().catch(console.error);
