let isShuttingDown = false;

const setShuttingDown = (value) => {
  isShuttingDown = value;
};

const shutdownMiddleware = (req, res, next) => {
  if (isShuttingDown) {
    return res.status(503).json({
      success: false,
      message: 'Server is shutting down, please retry in a few seconds'
    });
  }
  next();
};

module.exports = { shutdownMiddleware, setShuttingDown };
