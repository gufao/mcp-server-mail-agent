import fs from 'fs/promises';
import { EmailProvider } from './providers/base.js';
import { GmailProvider } from './providers/gmail.js';
import { OutlookProvider } from './providers/outlook.js';
import { IMAPProvider } from './providers/imap.js';
import {
  AccountConfig,
  AccountsFile,
  UnifiedEmail,
  Email,
  SearchOptions,
  SendOptions,
  Folder,
  GmailConfig,
  OutlookConfig,
  IMAPConfig,
} from './types.js';

const logger = {
  info: (...args: unknown[]) => console.error('[AccountManager]', ...args),
  error: (...args: unknown[]) => console.error('[AccountManager ERROR]', ...args),
  warn: (...args: unknown[]) => console.error('[AccountManager WARN]', ...args),
};

// Sensitive fields that MUST use environment variables
const SENSITIVE_FIELDS: Record<string, string[]> = {
  outlook: ['clientSecret'],
  imap: ['password'],
};

interface ConnectedAccount {
  config: AccountConfig;
  provider: EmailProvider;
}

export class AccountManager {
  private accounts: Map<string, ConnectedAccount> = new Map();
  private defaultAccountId: string | null = null;

  async loadAccounts(configPath: string): Promise<void> {
    const content = await fs.readFile(configPath, 'utf-8');

    // Validate secrets BEFORE replacing env vars
    this.validateSecrets(content);

    // Replace environment variables
    const resolved = content.replace(/\$\{(\w+)\}/g, (match, name) => {
      const value = process.env[name];
      if (value === undefined || value === '') {
        logger.warn(`Environment variable ${name} is not set or empty`);
        return '';
      }
      return value;
    });

    const config: AccountsFile = JSON.parse(resolved);

    for (const account of config.accounts) {
      try {
        this.validateResolvedSecrets(account);
        const provider = await this.createProvider(account);
        await provider.connect();

        this.accounts.set(account.id, { config: account, provider });
        logger.info(`Connected: ${account.name} (${account.provider})`);

        if (account.default) {
          this.defaultAccountId = account.id;
        }
      } catch (error) {
        logger.error(`Failed to connect ${account.name}:`, error);
      }
    }

    if (!this.defaultAccountId && this.accounts.size > 0) {
      this.defaultAccountId = this.accounts.keys().next().value!;
    }

    logger.info(`Loaded ${this.accounts.size} accounts`);
  }

  /**
   * Validates that sensitive fields use environment variables (${VAR} syntax)
   * Throws an error if plaintext secrets are detected
   */
  private validateSecrets(rawContent: string): void {
    const config: AccountsFile = JSON.parse(rawContent);

    for (const account of config.accounts) {
      const sensitiveFields = SENSITIVE_FIELDS[account.provider] || [];
      const accountConfig = account.config as unknown as Record<string, unknown>;

      for (const field of sensitiveFields) {
        const value = accountConfig[field];
        if (typeof value === 'string' && value.length > 0) {
          // Check if it's using environment variable syntax
          if (!value.startsWith('${') || !value.endsWith('}')) {
            throw new Error(
              `SECURITY ERROR: Account "${account.id}" has plaintext secret in field "${field}". ` +
              `Use environment variable syntax: "\${ENV_VAR_NAME}" instead of hardcoding secrets.`
            );
          }
        }
      }
    }
  }

  /**
   * Validates that sensitive fields resolved to non-empty values
   */
  private validateResolvedSecrets(account: AccountConfig): void {
    const sensitiveFields = SENSITIVE_FIELDS[account.provider] || [];
    const accountConfig = account.config as unknown as Record<string, unknown>;

    for (const field of sensitiveFields) {
      const value = accountConfig[field];
      if (typeof value === 'string' && value === '') {
        throw new Error(
          `Account "${account.id}": Required secret "${field}" is empty. ` +
          `Make sure the environment variable is set.`
        );
      }
    }
  }

  private async createProvider(account: AccountConfig): Promise<EmailProvider> {
    switch (account.provider) {
      case 'gmail':
        return new GmailProvider(account.config as GmailConfig);
      case 'outlook':
        return new OutlookProvider(account.config as OutlookConfig);
      case 'imap':
        return new IMAPProvider(account.config as IMAPConfig);
      default:
        throw new Error(`Unknown provider: ${account.provider}`);
    }
  }

  // Get all accounts info
  getAccounts(): { id: string; name: string; provider: string; isDefault: boolean }[] {
    return Array.from(this.accounts.entries()).map(([id, acc]) => ({
      id,
      name: acc.config.name,
      provider: acc.config.provider,
      isDefault: id === this.defaultAccountId,
    }));
  }

  // Get specific provider
  getProvider(accountId?: string): ConnectedAccount {
    const id = accountId || this.defaultAccountId;
    if (!id) throw new Error('No account specified and no default set');

    const account = this.accounts.get(id);
    if (!account) throw new Error(`Account not found: ${id}`);

    return account;
  }

  // === UNIFIED OPERATIONS ===

  // Fetch unread from ALL accounts
  async fetchAllUnread(maxResultsPerAccount = 10): Promise<UnifiedEmail[]> {
    const results: UnifiedEmail[] = [];

    const promises = Array.from(this.accounts.entries()).map(async ([id, acc]) => {
      try {
        const emails = await acc.provider.fetchUnread(maxResultsPerAccount);
        return emails.map((email) => this.tagEmail(email, acc.config));
      } catch (error) {
        logger.error(`Error fetching from ${acc.config.name}:`, error);
        return [];
      }
    });

    const allResults = await Promise.all(promises);
    for (const emails of allResults) {
      results.push(...emails);
    }

    // Sort by date descending
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return results;
  }

  // Search across ALL accounts
  async searchAll(options: SearchOptions): Promise<UnifiedEmail[]> {
    const results: UnifiedEmail[] = [];

    const promises = Array.from(this.accounts.entries()).map(async ([id, acc]) => {
      try {
        const emails = await acc.provider.search(options);
        return emails.map((email) => this.tagEmail(email, acc.config));
      } catch (error) {
        logger.error(`Error searching ${acc.config.name}:`, error);
        return [];
      }
    });

    const allResults = await Promise.all(promises);
    for (const emails of allResults) {
      results.push(...emails);
    }

    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return results;
  }

  // Get all folders from all accounts
  async getAllFolders(): Promise<{ accountId: string; accountName: string; folders: Folder[] }[]> {
    const results: { accountId: string; accountName: string; folders: Folder[] }[] = [];

    for (const [id, acc] of this.accounts) {
      try {
        const folders = await acc.provider.getFolders();
        results.push({
          accountId: id,
          accountName: acc.config.name,
          folders,
        });
      } catch (error) {
        logger.error(`Error getting folders from ${acc.config.name}:`, error);
      }
    }

    return results;
  }

  // === SINGLE ACCOUNT OPERATIONS ===

  // These require accountId because we need to know which account to operate on

  async getMessage(accountId: string, emailId: string): Promise<UnifiedEmail | null> {
    const acc = this.getProvider(accountId);
    const email = await acc.provider.getMessage(emailId);
    if (!email) return null;
    return this.tagEmail(email, acc.config);
  }

  async markAsRead(accountId: string, emailId: string): Promise<void> {
    const acc = this.getProvider(accountId);
    await acc.provider.markAsRead(emailId);
  }

  async markAsUnread(accountId: string, emailId: string): Promise<void> {
    const acc = this.getProvider(accountId);
    await acc.provider.markAsUnread(emailId);
  }

  async deleteEmail(accountId: string, emailId: string): Promise<void> {
    const acc = this.getProvider(accountId);
    await acc.provider.deleteEmail(emailId);
  }

  async sendEmail(accountId: string | undefined, options: SendOptions): Promise<string> {
    const acc = this.getProvider(accountId);
    return acc.provider.sendEmail(options);
  }

  // Helper to tag email with account info
  private tagEmail(email: Email, config: AccountConfig): UnifiedEmail {
    return {
      ...email,
      accountId: config.id,
      accountName: config.name,
      providerType: config.provider,
    };
  }

  // Cleanup
  async disconnect(): Promise<void> {
    for (const [id, acc] of this.accounts) {
      try {
        await acc.provider.disconnect();
      } catch (error) {
        logger.error(`Error disconnecting ${id}:`, error);
      }
    }
    this.accounts.clear();
  }
}
