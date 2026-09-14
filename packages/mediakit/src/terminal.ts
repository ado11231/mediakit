import { stderr } from 'node:process';

const colorEnabled =
  stderr.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb';
const paint = (code: number, value: string): string =>
  colorEnabled ? `\u001b[${code}m${value}\u001b[0m` : value;

export const terminal = {
  accent: (value: string): string => paint(36, value),
  success: (value: string): string => paint(32, value),
  error: (value: string): string => paint(31, value),
  info(message: string): void {
    stderr.write(`${paint(36, '●')} ${message}\n`);
  },
};

export class StatusLine {
  private readonly frames = ['◐', '◓', '◑', '◒'] as const;
  private frame = 0;
  private message: string;
  private timer: NodeJS.Timeout | undefined;

  constructor(message: string) {
    this.message = message;
    if (stderr.isTTY) {
      this.render();
      this.timer = setInterval(() => {
        this.render();
      }, 80);
      this.timer.unref();
    } else stderr.write(`○ ${message}\n`);
  }

  update(message: string): void {
    this.message = message;
    if (stderr.isTTY) this.render();
  }

  succeed(message = this.message): void {
    this.finish(`${terminal.success('✓')} ${message}`);
  }

  fail(message = this.message): void {
    this.finish(`${terminal.error('✗')} ${message}`);
  }

  private render(): void {
    const glyph = this.frames[this.frame++ % this.frames.length] ?? '◐';
    stderr.write(`\r\u001b[2K${terminal.accent(glyph)} ${this.message}`);
  }

  private finish(message: string): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    stderr.write(stderr.isTTY ? `\r\u001b[2K${message}\n` : `${message}\n`);
  }
}
