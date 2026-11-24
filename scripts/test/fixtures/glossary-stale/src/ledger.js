// Appends one payment to the ledger.
export function record(ledger, payment) {
  return [...ledger, payment];
}
