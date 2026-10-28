/** Expected failure that is safe to show to the caller (admin UI or device API). */
export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}
