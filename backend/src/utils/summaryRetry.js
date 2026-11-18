// Queue delays are persisted, not slept inside an open PostgreSQL transaction.
const maxDelay = 5 * 60 * 1000;
export function parseSummaryRetryAfter(value, now = Date.now()) {
 if(typeof value!=='string' || !value.trim()) return 0;
 const text=value.trim();
 const delay=/^\d+$/.test(text)?Number(text)*1000:Date.parse(text)-now;
 return Number.isFinite(delay)?Math.min(maxDelay,Math.max(0,delay)):0;
}
export function summaryRetryDelay(attempt = 1, providerDelay = 0, random = Math.random) {
 const base=Math.min(120000,30000*2**Math.max(0,Math.min(3,attempt-1)));
 const hint=Number.isFinite(providerDelay)?Math.max(0,providerDelay):0;
 return Math.min(maxDelay,Math.max(base,hint)+Math.floor(random()*3000));
}
