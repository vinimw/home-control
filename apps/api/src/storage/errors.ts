/** The database could not be opened or migrated. Fatal at startup, with a message safe to print. */
export class StorageError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'StorageError';
  }
}
