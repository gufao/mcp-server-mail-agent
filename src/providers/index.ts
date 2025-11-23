import { EmailProvider } from './base.js';
import { GmailProvider } from './gmail.js';
import { OutlookProvider } from './outlook.js';
import { IMAPProvider } from './imap.js';
import { Config, loadConfig } from '../config.js';

export async function createProvider(): Promise<EmailProvider> {
  const config = loadConfig();
  let provider: EmailProvider;

  switch (config.provider) {
    case 'gmail':
      provider = new GmailProvider(config.gmail);
      break;
    case 'outlook':
      provider = new OutlookProvider(config.outlook);
      break;
    case 'imap':
      provider = new IMAPProvider(config.imap);
      break;
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }

  await provider.connect();
  return provider;
}

export { EmailProvider } from './base.js';
export { GmailProvider } from './gmail.js';
export { OutlookProvider } from './outlook.js';
export { IMAPProvider } from './imap.js';
