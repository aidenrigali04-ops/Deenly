function httpError(statusCode, message, publicMessage) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (publicMessage) {
    error.publicMessage = publicMessage;
  }
  return error;
}

module.exports = {
  httpError
};
