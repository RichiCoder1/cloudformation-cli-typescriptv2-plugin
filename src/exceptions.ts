export class HandlerBaseError extends Error {
    readonly type = Symbol.for('HandlerBaseError');
    constructor(message: string) {
        super(message);
    }

    static isHandlerError(error: unknown): error is HandlerBaseError {
        return (
            error !== null &&
            typeof error === 'object' &&
            'type' in error &&
            error.type === Symbol.for('HandlerBaseError')
        );
    }
}

export class CreateError extends HandlerBaseError {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = 'CreateError';
        this.cause = cause;
    }
}
