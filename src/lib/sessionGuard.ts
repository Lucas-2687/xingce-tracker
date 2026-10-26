export class SessionLockedError extends Error {
  constructor() { super("session_locked"); }
}

export class SessionGuard {
  private generation = 0;
  private unlocked = true;
  private controllers = new Set<AbortController>();

  constructor(private readonly onLock: () => void, private readonly expiresAt: number) {}

  get active() { return this.unlocked; }

  start() { this.generation++; this.unlocked = true; }

  dispose() {
    this.unlocked = false;
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }

  lock() {
    if (!this.unlocked) return;
    this.dispose();
    this.onLock();
  }

  async request<T>(input: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null }> {
    if (Date.now() >= this.expiresAt) this.lock();
    if (!this.active) throw new SessionLockedError();
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.add(controller);
    const signals = [controller.signal, AbortSignal.timeout(10_000)];
    if (init.signal) signals.push(init.signal);
    const assertCurrent = () => {
      if (!this.active || generation !== this.generation) throw new SessionLockedError();
      if (Date.now() >= this.expiresAt) { this.lock(); throw new SessionLockedError(); }
    };
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
      assertCurrent();
      if (response.status === 401) { this.lock(); throw new SessionLockedError(); }
      const data = response.ok ? await response.json() as T : null;
      // Reading a body is asynchronous too; logout may happen after headers arrive.
      assertCurrent();
      return { ok: response.ok, status: response.status, data };
    } finally { this.controllers.delete(controller); }
  }
}
