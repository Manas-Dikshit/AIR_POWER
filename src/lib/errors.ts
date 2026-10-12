/** Error type used across the service layer. Kept free of framework imports so
 *  it can be used by the seed script and by unit tests. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
