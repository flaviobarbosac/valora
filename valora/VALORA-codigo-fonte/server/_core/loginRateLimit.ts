// In-memory throttle for failed logins. It resets when the server restarts and is
// per process; put a shared store in front of it if you run several instances.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 30;

type Bucket = { failures: number; firstFailureAt: number };
const buckets = new Map<string, Bucket>();

function current(key: string, now: number) {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.firstFailureAt > WINDOW_MS) {
    buckets.delete(key);
    return null;
  }
  return bucket;
}

function keys(ip: string, account: string) {
  return { accountKey: `account:${account}`, ipKey: `ip:${ip}` };
}

/** Returns how many seconds the caller must wait, or 0 when the attempt may proceed. */
export function loginRetryAfterSeconds(ip: string, account: string, now = Date.now()) {
  const { accountKey, ipKey } = keys(ip, account);
  const limits: Array<[string, number]> = [[accountKey, MAX_FAILURES_PER_ACCOUNT], [ipKey, MAX_FAILURES_PER_IP]];
  let wait = 0;
  for (const [key, max] of limits) {
    const bucket = current(key, now);
    if (bucket && bucket.failures >= max) {
      wait = Math.max(wait, Math.ceil((bucket.firstFailureAt + WINDOW_MS - now) / 1000));
    }
  }
  return wait;
}

export function recordLoginFailure(ip: string, account: string, now = Date.now()) {
  for (const key of Object.values(keys(ip, account))) {
    const bucket = current(key, now);
    if (bucket) bucket.failures += 1;
    else buckets.set(key, { failures: 1, firstFailureAt: now });
  }
  if (buckets.size > 10_000) {
    buckets.forEach((_bucket, key) => { current(key, now); });
  }
}

export function clearLoginFailures(ip: string, account: string) {
  buckets.delete(keys(ip, account).accountKey);
}

/**
 * Generic fixed-window limiter (sign-ups, invitations). Returns false when
 * `key` already used `max` attempts inside `windowMs`; otherwise counts this one.
 */
export function consumeRateLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  const bucketKey = `generic:${key}`;
  const bucket = buckets.get(bucketKey);
  if (!bucket || now - bucket.firstFailureAt > windowMs) {
    buckets.set(bucketKey, { failures: 1, firstFailureAt: now });
    return true;
  }
  if (bucket.failures >= max) return false;
  bucket.failures += 1;
  return true;
}

export function resetLoginRateLimit() {
  buckets.clear();
}
