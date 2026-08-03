import { duplicateRegistration, unknownRegistryKey, type SpecLocation } from '../errors.js';
import { callSite } from './call-site.js';

interface Entry<T> {
  value: T;
  site: string;
}

/**
 * Registries are instances rather than module singletons. A singleton would make
 * registration order significant across test files and would let one spec's config leak
 * into another's render, which is exactly the kind of hidden state that makes a render
 * non-reproducible.
 */
export class Registry<T> {
  readonly #kind: string;
  readonly #entries = new Map<string, Entry<T>>();

  constructor(kind: string) {
    this.#kind = kind;
  }

  get kind(): string {
    return this.#kind;
  }

  register(name: string, value: T): void {
    const existing = this.#entries.get(name);
    if (existing !== undefined) {
      throw duplicateRegistration(this.#kind, name, existing.site, callSite());
    }
    this.#entries.set(name, { value, site: callSite() });
  }

  registerAll(entries: Readonly<Record<string, T>>): void {
    for (const [name, value] of Object.entries(entries)) this.register(name, value);
  }

  get(name: string, location?: SpecLocation): T {
    const entry = this.#entries.get(name);
    if (entry === undefined) {
      throw unknownRegistryKey(this.#kind, name, this.names(), location);
    }
    return entry.value;
  }

  has(name: string): boolean {
    return this.#entries.has(name);
  }

  /** Sorted, so a thrown message is identical across runs regardless of registration order. */
  names(): readonly string[] {
    return [...this.#entries.keys()].sort();
  }

  get size(): number {
    return this.#entries.size;
  }
}
