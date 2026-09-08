export interface FixtureRequest {
  scene: string;
  fixture: string;
  time: string;
  seed: number;
  locale: string;
  timezone: string;
  theme: 'light' | 'dark';
}

export function readFixtureRequest(url: string): FixtureRequest {
  const query = new URL(url).searchParams;
  const scene = query.get('scene');
  const fixture = query.get('fixture');
  const time = query.get('time');
  const locale = query.get('locale');
  const timezone = query.get('timezone');
  const theme = query.get('theme');
  const seed = Number(query.get('seed'));
  if (
    !scene ||
    !fixture ||
    !time ||
    !locale ||
    !timezone ||
    !query.has('seed') ||
    !Number.isInteger(seed) ||
    !Number.isFinite(Date.parse(time)) ||
    (theme !== 'light' && theme !== 'dark')
  ) {
    throw new Error('Incomplete fixture request. Open this entry through mediakit capture.');
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(scene) || !/^[a-z0-9][a-z0-9-]*$/.test(fixture))
    throw new Error('Invalid scene or fixture name.');
  return { scene, fixture, time, seed, locale, timezone, theme };
}

export function createFixtureState<T>(
  fixtures: Readonly<Record<string, T>>,
  request: FixtureRequest,
): T {
  const fixture = fixtures[request.fixture];
  if (fixture === undefined)
    throw new Error(`Unknown fixture "${request.fixture}" for ${request.scene}.`);
  // Every scene gets a fresh JSON-compatible state, including on native runtimes.
  return JSON.parse(JSON.stringify(fixture)) as T;
}

export function fixtureReadyId(request: FixtureRequest): string {
  return `mediakit-ready-${request.scene}-${request.fixture}`;
}

export function markFixtureReady(request: FixtureRequest): void {
  if (typeof document === 'undefined')
    throw new Error('On native, set fixtureReadyId(request) as the ready view testID.');
  document.documentElement.dataset.mediakitReady = fixtureReadyId(request);
}

export function createFixtureRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
