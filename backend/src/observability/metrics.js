function createMetrics() {
  const state = {
    totalRequests: 0,
    totalErrors: 0,
    statusCounts: {},
    routeCounts: {},
    avgResponseMs: 0
  };

  function middleware() {
    return (req, res, next) => {
      const startedAt = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - startedAt;
        const status = String(res.statusCode);
        const routeKey = `${req.method} ${req.route?.path || req.path}`;

        state.totalRequests += 1;
        state.statusCounts[status] = (state.statusCounts[status] || 0) + 1;
        state.routeCounts[routeKey] = (state.routeCounts[routeKey] || 0) + 1;
        if (res.statusCode >= 500) {
          state.totalErrors += 1;
        }

        state.avgResponseMs =
          ((state.avgResponseMs * (state.totalRequests - 1)) + duration) /
          state.totalRequests;
      });
      next();
    };
  }

  function snapshot() {
    return {
      ...state,
      avgResponseMs: Number(state.avgResponseMs.toFixed(2))
    };
  }

  return {
    middleware,
    snapshot
  };
}

module.exports = {
  createMetrics
};
