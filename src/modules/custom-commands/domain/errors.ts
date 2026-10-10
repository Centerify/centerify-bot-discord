export class CustomCommandError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class CustomCommandNotFoundError extends CustomCommandError {}
export class CustomCommandAlreadyExistsError extends CustomCommandError {}
export class CustomCommandLimitError extends CustomCommandError {}
export class CustomCommandPermissionError extends CustomCommandError {}
export class CustomCommandCooldownError extends CustomCommandError {
  public constructor(public readonly retryAfterSeconds: number) {
    super(`Try again in ${retryAfterSeconds} seconds.`);
  }
}
export class CustomCommandValidationError extends CustomCommandError {}
/** Invalid invocation input; safe to show to the invoking member. */
export class CustomCommandArgumentError extends CustomCommandValidationError {}
