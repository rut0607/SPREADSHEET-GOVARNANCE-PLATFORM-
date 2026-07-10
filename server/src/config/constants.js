// Shared, environment-overridable defaults used across multiple controllers/services.
// Kept in one place so DEFAULT_EFFICIENCY_THRESHOLD never drifts out of sync between
// productionController, machineController, and weeklyReportService.

const DEFAULT_EFFICIENCY_THRESHOLD = parseFloat(process.env.DEFAULT_EFFICIENCY_THRESHOLD) || 85.00;

module.exports = { DEFAULT_EFFICIENCY_THRESHOLD };
