function createMetrics() {
  const state = {
    totalRequests: 0,
    totalErrors: 0,
    statusCounts: {},
    routeCounts: {},
    avgResponseMs: 0,
    recentDurationsMs: []
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
        state.recentDurationsMs.push(duration);
        if (state.recentDurationsMs.length > 1000) {
          state.recentDurationsMs.shift();
        }
      });
      next();
    };
  }

  function calculateP95(values) {
    if (!values.length) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return sorted[idx];
  }

  function snapshot() {
    const requestErrorRate =
      state.totalRequests > 0 ? state.totalErrors / state.totalRequests : 0;
    const p95Ms = calculateP95(state.recentDurationsMs);
    return {
      ...state,
      avgResponseMs: Number(state.avgResponseMs.toFixed(2)),
      requestErrorRate: Number(requestErrorRate.toFixed(4)),
      p95Ms
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
