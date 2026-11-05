// A request error with an HTTP status and a plain-language message the user can act on.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code, msg) => new HttpError(400, code, msg);
export const forbidden = (code, msg) => new HttpError(403, code, msg);
export const notFound = (code, msg) => new HttpError(404, code, msg);
export const conflict = (code, msg) => new HttpError(409, code, msg);
