class SellerBoostInvalidStateError extends Error {
  constructor(message = "Invalid seller boost state") {
    super(message);
    this.name = "SellerBoostInvalidStateError";
    this.code = "SELLER_BOOST_INVALID_STATE";
  }
}

class SellerBoostNotFoundError extends Error {
  constructor(message = "Seller boost purchase not found") {
    super(message);
    this.name = "SellerBoostNotFoundError";
    this.code = "SELLER_BOOST_NOT_FOUND";
  }
}

class SellerBoostPostOwnershipError extends Error {
  constructor(message = "One or more posts are not owned by the seller") {
    super(message);
    this.name = "SellerBoostPostOwnershipError";
    this.code = "SELLER_BOOST_POST_OWNERSHIP";
  }
}

module.exports = {
  SellerBoostInvalidStateError,
  SellerBoostNotFoundError,
  SellerBoostPostOwnershipError
};
