export class MediakitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediakitError';
  }
}

export interface SpecLocation {
  file?: string;
  frameIndex?: number;
  blockIndex?: number;
  blockType?: string;
}

/**
 * Every message in the failure table names the offending file and, where a spec is
 * involved, the frame index. An error that says only "invalid spec" costs more than it
 * saves, so this formatter is applied to all of them rather than left to each call site.
 */
export const formatLocation = (location?: SpecLocation): string => {
  if (location === undefined) return '';

  const parts: string[] = [];
  if (location.file !== undefined) parts.push(location.file);
  if (location.frameIndex !== undefined) parts.push(`frame ${location.frameIndex}`);
  if (location.blockIndex !== undefined) {
    const type = location.blockType === undefined ? '' : ` (${location.blockType})`;
    parts.push(`block ${location.blockIndex}${type}`);
  }

  return parts.length === 0 ? '' : ` in ${parts.join(', ')}`;
};

const list = (names: readonly string[]): string =>
  names.length === 0 ? '  (nothing registered)' : names.map((name) => `  ${name}`).join('\n');

export const unknownRegistryKey = (
  kind: string,
  name: string,
  registered: readonly string[],
  location?: SpecLocation,
): MediakitError =>
  new MediakitError(
    `Unknown ${kind} "${name}"${formatLocation(location)}.\n` +
      `Registered ${kind}s:\n${list(registered)}`,
  );

export const duplicateRegistration = (
  kind: string,
  name: string,
  firstSite: string,
  secondSite: string,
): MediakitError =>
  new MediakitError(
    `The ${kind} "${name}" is registered twice.\n` +
      `  first:  ${firstSite}\n` +
      `  second: ${secondSite}\n` +
      `Rename one of them, or remove the duplicate registration.`,
  );

export const unknownSlot = (
  layout: string,
  slot: string,
  declared: readonly string[],
  location?: SpecLocation,
): MediakitError =>
  new MediakitError(
    `The layout "${layout}" does not declare a slot "${slot}"${formatLocation(location)}.\n` +
      `Slots declared by "${layout}":\n${list(declared)}`,
  );

export const missingSlot = (layout: string, location?: SpecLocation): MediakitError =>
  new MediakitError(
    `The layout "${layout}" declares slots, so every block must name one${formatLocation(
      location,
    )}.`,
  );

export const unexpectedSlot = (
  layout: string,
  slot: string,
  location?: SpecLocation,
): MediakitError =>
  new MediakitError(
    `The layout "${layout}" declares no slots, but a block sets slot "${slot}"${formatLocation(
      location,
    )}.\n` +
      `The reference implementation accepted this and silently ignored it, which is the ` +
      `failure this validation exists to prevent.`,
  );
