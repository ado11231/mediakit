import process from 'node:process';
import { styleText } from 'node:util';

/**
 * Colour carries meaning or it is not used: green for a completed write, red for a violation,
 * dim for a path. Routed through one module because CLI tests capture stdout and CI logs are
 * parsed by machines, so `NO_COLOR` and a non-TTY stream both have to mean plain text.
 *
 * node:util's styleText rather than chalk or picocolors: the dependency-count gate is the
 * thing this project competes on, and a colour library is the easiest one to lose.
 */
const enabled = (): boolean => process.env['NO_COLOR'] === undefined && process.stdout.isTTY;

type Colour = 'green' | 'red' | 'dim';

const paint = (colour: Colour, text: string): string =>
  enabled() ? styleText(colour, text) : text;

export const ok = (text: string): string => paint('green', text);
export const bad = (text: string): string => paint('red', text);
export const dim = (text: string): string => paint('dim', text);
