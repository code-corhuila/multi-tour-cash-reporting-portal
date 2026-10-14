import { Injectable } from '@angular/core';

/** Makes the Idempotency-Key of a write; abstract so a test can follow the keys. A UUID fits the 8 to 128 characters of the header. */
@Injectable({ providedIn: 'root', useFactory: () => new RandomIdempotencyKeys() })
export abstract class IdempotencyKeys { abstract generate(): string; }

class RandomIdempotencyKeys extends IdempotencyKeys { override generate(): string { return crypto.randomUUID(); } }

/**
 * One key per intention (plan D-07: a movement, a base change, a closing, a correction): a retry or a double click
 * with the same data reuses it, so the service records one; other data, or a settled intention, gets a new one.
 */
export class IntentionKey {
  private last?: { readonly data: string; readonly key: string };

  constructor(private readonly keys: IdempotencyKeys) {}

  keyFor(data: unknown): string {
    const text = JSON.stringify(data);
    if (this.last?.data !== text) { this.last = { data: text, key: this.keys.generate() }; }
    return this.last.key;
  }

  /** The service answered: the next intention is a new one. */
  settled(): void { this.last = undefined; }
}
