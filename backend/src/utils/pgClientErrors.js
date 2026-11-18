// Pool-level error handlers cover idle clients. Checked-out clients also need a
// listener while they wait on non-database work (for example an AI response).
const observedClients = new WeakMap();
const connectionCodes = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN',
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
  '57P01', '57P02', '57P03', '53300',
]);

export const isPgConnectionError = error => connectionCodes.has(error?.code);

export function observePgClient(client) {
  let state = observedClients.get(client);
  if (!state) {
    state = { error: null };
    observedClients.set(client, state);
    // Never throw from this event: pending queries reject through pg itself.
    // Retain the error so callers can discard this socket instead of reusing it.
    client.on('error', error => { state.error = error; });
  }
  return state;
}
