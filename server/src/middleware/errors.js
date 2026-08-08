/** A failure the caller caused and can fix, carrying the status to report. */
export class RequestError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new RequestError(400, message, details);
export const notFound = (message) => new RequestError(404, message);

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export const route = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: { message: `No route for ${req.method} ${req.path}` } });
};

/**
 * The only place that turns an exception into a response.
 *
 * Client errors say what was wrong so the caller can fix it. Everything else
 * returns a generic message: a stack trace or a driver error string tells an
 * attacker about the schema, and tells the caller nothing they can act on. The
 * detail goes to the log instead.
 */
export const errorHandler = (error, req, res, _next) => {
  if (error instanceof RequestError) {
    res.status(error.status).json({
      error: { message: error.message, ...(error.details ? { details: error.details } : {}) }
    });
    return;
  }

  console.error(`[api] ${req.method} ${req.path} failed:`, error);
  res.status(500).json({ error: { message: 'Internal server error' } });
};
