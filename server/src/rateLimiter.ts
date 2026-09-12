export class TokenBucketRateLimiter {
  private capacity: number;
  private refillRate: number; // tokens per ms
  private tokens: number;
  private lastRefill: number;

  constructor(capacity: number, refillRatePerSec: number) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSec / 1000;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

export class SessionRateLimiters {
  public cursorLimiter: TokenBucketRateLimiter;
  public reactionLimiter: TokenBucketRateLimiter;
  public actionLimiter: TokenBucketRateLimiter;

  constructor() {
    this.cursorLimiter = new TokenBucketRateLimiter(40, 35); // Burst 40, 35/sec
    this.reactionLimiter = new TokenBucketRateLimiter(8, 5); // Burst 8, 5/sec
    this.actionLimiter = new TokenBucketRateLimiter(60, 50); // Burst 60, 50/sec
  }
}
