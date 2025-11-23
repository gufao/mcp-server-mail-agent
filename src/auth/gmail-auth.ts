import { authenticate } from '@google-cloud/local-auth';
import fs from 'fs/promises';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

async function setup() {
  console.log('Starting Gmail OAuth...');

  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: './credentials/gmail-credentials.json',
  });

  const keys = JSON.parse(await fs.readFile('./credentials/gmail-credentials.json', 'utf-8'));

  const token = {
    type: 'authorized_user',
    client_id: keys.installed.client_id,
    client_secret: keys.installed.client_secret,
    refresh_token: auth.credentials.refresh_token,
  };

  await fs.writeFile('./credentials/gmail-token.json', JSON.stringify(token, null, 2));
  console.log('Gmail token saved to credentials/gmail-token.json');
}

setup().catch(console.error);
