function errorHandler(logger) {
  return (err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    const message =
      err.publicMessage ||
      (statusCode >= 500 ? "Internal server error" : err.message || "Request failed");

    logger.error(
      {
        err,
        method: req.method,
        path: req.path,
        requestId: req.id
      },
      "request_failed"
    );

    res.status(statusCode).json({
      status: "error",
      message,
      requestId: req.id
    });
  };
}

function notFoundHandler(req, res) {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    requestId: req.id
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
