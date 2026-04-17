class InsufficientPointsError extends Error {
  constructor(message = "Insufficient points") {
    super(message);
    this.name = "InsufficientPointsError";
    this.code = "INSUFFICIENT_POINTS";
    this.statusCode = 422;
  }
}

class LedgerEntryNotFoundError extends Error {
  constructor(message = "Ledger entry not found") {
    super(message);
    this.name = "LedgerEntryNotFoundError";
    this.code = "LEDGER_ENTRY_NOT_FOUND";
  }
}

class InvalidReversalError extends Error {
  constructor(message = "Invalid reversal") {
    super(message);
    this.name = "InvalidReversalError";
    this.code = "INVALID_REVERSAL";
  }
}

module.exports = {
  InsufficientPointsError,
  LedgerEntryNotFoundError,
  InvalidReversalError
};
