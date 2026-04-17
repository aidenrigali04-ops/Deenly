class ReferralError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ReferralError";
    this.code = code;
  }
}

class SelfReferralError extends ReferralError {
  constructor(message = "Self-referral is not allowed") {
    super(message, "SELF_REFERRAL");
    this.name = "SelfReferralError";
  }
}

class ReferralCodeInvalidError extends ReferralError {
  constructor(message = "Referral code is not valid") {
    super(message, "REFERRAL_CODE_INVALID");
    this.name = "ReferralCodeInvalidError";
  }
}

module.exports = {
  ReferralError,
  SelfReferralError,
  ReferralCodeInvalidError
};
