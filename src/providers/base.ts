import { Email, SearchOptions, SendOptions, Folder } from '../types.js';

export abstract class EmailProvider {
  abstract readonly name: string;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  abstract fetchUnread(maxResults?: number): Promise<Email[]>;
  abstract search(options: SearchOptions): Promise<Email[]>;
  abstract getMessage(id: string): Promise<Email | null>;
  abstract markAsRead(id: string): Promise<void>;
  abstract markAsUnread(id: string): Promise<void>;
  abstract sendEmail(options: SendOptions): Promise<string>;
  abstract getFolders(): Promise<Folder[]>;

  // Optional: delete, move, etc.
  async deleteEmail(id: string): Promise<void> {
    throw new Error('Delete not supported by this provider');
  }

  async moveEmail(id: string, folderId: string): Promise<void> {
    throw new Error('Move not supported by this provider');
  }
}
