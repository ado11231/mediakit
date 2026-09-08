import { spawn, type ChildProcess } from 'node:child_process';

export function captureEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'HOME',
    'TMPDIR',
    'TEMP',
    'SYSTEMROOT',
    'LANG',
    'DEVELOPER_DIR',
    'JAVA_HOME',
  ]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return {
    ...environment,
    ...extra,
    MEDIAKIT_CAPTURE: '1',
    MAESTRO_CLI_NO_ANALYTICS: '1',
    EXPO_NO_TELEMETRY: '1',
  };
}
export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout = 30000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: captureEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errors = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(`${command} ${args.slice(0, 3).join(' ')}: timed out after ${timeout}ms.`),
      );
    }, timeout);
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-4000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`${command}: ${error.message}. Install the tool and put it on PATH.`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            `${command} ${args.slice(0, 3).join(' ')} exited ${code}: ${errors || output.slice(-4000)}`,
          ),
        );
    });
  });
}
export function stopProcess(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  } else child.kill('SIGTERM');
}
