import { unknownRegistryKey, type SpecLocation } from '../errors.js';
import type { ResolvedTokens, TypeStyle } from './contract.js';

/**
 * Token lookups fail the same way registry lookups do, and for the same reason: a mistyped
 * `accnet` that resolves to `undefined` renders as a browser default rather than as an
 * error, and nobody notices until the asset is already approved. Reusing the registry's
 * message shape means the error also lists the keys that do exist.
 */
const lookup = <T>(
  bag: Readonly<Record<string, T>>,
  kind: string,
  key: string,
  location?: SpecLocation,
): T => {
  const value = bag[key];
  if (value === undefined) {
    throw unknownRegistryKey(kind, key, Object.keys(bag).sort(), location);
  }
  return value;
};

export const colorToken = (
  tokens: ResolvedTokens,
  key: string,
  location?: SpecLocation,
): string => lookup(tokens.color, 'color token', key, location);

export const typeToken = (
  tokens: ResolvedTokens,
  key: string,
  location?: SpecLocation,
): TypeStyle => lookup(tokens.type, 'type token', key, location);

export const spaceToken = (
  tokens: ResolvedTokens,
  key: string,
  location?: SpecLocation,
): number => lookup(tokens.space, 'space token', key, location);

export const radiusToken = (
  tokens: ResolvedTokens,
  key: string,
  location?: SpecLocation,
): number => lookup(tokens.radius, 'radius token', key, location);
