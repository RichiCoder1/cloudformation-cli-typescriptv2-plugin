import { HandlerErrorCode } from './response.js';
const errorBrand = Symbol.for('aws.errorType');

export class BaseHandlerError extends Error {
    constructor(
        message: string,
        public readonly code: HandlerErrorCode,
        options: ErrorOptions = {}
    ) {
        super(message, options);
        this[errorBrand] = 'BaseHandlerError';
    }

    static isHandlerError(error: unknown): error is BaseHandlerError {
        return (
            error !== null && typeof error === 'object' && errorBrand in error
        );
    }
}

/**
 * Thrown when a handler encounters an error with the user input.
 *
 * @remarks This error is used to indicate that the user input is invalid and
 * should be corrected. The error message will be displayed to the user, so ensure
 * that it is clear and actionable.
 */
export class InvalidRequestError extends BaseHandlerError {
    constructor(message: string, options: ErrorOptions) {
        super(message, HandlerErrorCode.InvalidRequest, options);
        this.name = 'InvalidRequestError';
    }
}

/**
 * Thrown when a handler encounters an internal error.
 *
 * @remarks This error is used to indicate that the handler encountered an
 * unexpected error. Make sure to include a meaningful error message and
 * provide the downstream error if any.
 */
export class ServiceInternalError extends BaseHandlerError {
    constructor(message: string, cause?: Error) {
        super(message, HandlerErrorCode.ServiceInternalError, { cause });
        this.name = 'ServiceInternalError';
    }
}

export class NotUpdatableError extends BaseHandlerError {
    constructor(message: string, options: ErrorOptions) {
        super(message, HandlerErrorCode.NotUpdatable, options);
        this.name = 'NotUpdatableError';
    }
}

/**
 * Thrown when specified resource already existed before the execution of this handler. This error is applicable to create handlers only.
 *
 * @remarks This error is used to indicate that the resource already existed before the execution of this handler.
 * Use this in create handlers.
 */
export class AlreadyExistsError extends BaseHandlerError {
    constructor(typeName: string, identifier: string) {
        super(
            `Resource of type '${typeName}' with identifier '${identifier}' already exists.`,
            HandlerErrorCode.AlreadyExists
        );
        this.name = 'AlreadyExistsError';
    }
}

/**
 * Throw when the specified resource doesn't exist, or is in a terminal, inoperable, and irrecoverable state.
 */
export class NotFoundError extends BaseHandlerError {
    constructor(typeName: string, identifier: string) {
        super(
            `Resource of type '${typeName}' with identifier '${identifier}' was not found.`,
            HandlerErrorCode.NotFound
        );
        this.name = 'NotFoundError';
    }
}
