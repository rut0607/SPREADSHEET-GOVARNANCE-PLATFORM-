const { getJobHistory } = require('../services/syncService');
const { getAlertConfig, setAlertConfig } = require('../services/alertService');
const { handlePrismaError } = require('../utils/prismaErrorHandler');

const getJobs = async (req, res) => {
  try {
    res.json({ success: true, data: { jobs: getJobHistory() } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get job history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch job history' });
  }
};

const getAlertConfiguration = async (req, res) => {
  try {
    res.json({ success: true, data: { config: getAlertConfig() } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get alert config error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch alert configuration' });
  }
};

const updateAlertConfiguration = async (req, res) => {
  try {
    const { minOeThreshold, maxDaysWithoutEntry } = req.body;
    const config = setAlertConfig({ minOeThreshold, maxDaysWithoutEntry });
    res.json({ success: true, message: 'Alert configuration updated successfully', data: { config } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Update alert config error:', error);
    res.status(500).json({ success: false, message: 'Failed to update alert configuration' });
  }
};

module.exports = { getJobs, getAlertConfiguration, updateAlertConfiguration };
