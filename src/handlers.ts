import { Action } from './request.js';
import { OperationStatus } from './response.js';
import { Logger } from 'pino';
import { Except, SetRequired, Simplify } from 'type-fest';
import { Input } from './types.js';

// I apologize to anyone who has to read this code.
// TypeScript requires some crazy work for a good dev experience.

export type BaseEvent<TTypeConfiguration extends Input> = {
    readonly action: Action;
    readonly logger: Logger;
    readonly typeConfiguration: TTypeConfiguration;
};

export type CreateEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = BaseEvent<TTypeConfiguration> & {
    readonly action: 'CREATE';
    readonly properties: Simplify<Omit<TProperties, TPrimaryKeys>>;
};

export type CreateCallbackEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = CreateEvent<TProperties, TTypeConfiguration, TPrimaryKeys> & {
    readonly callbackContext: Record<string, string>;
};

export type UpdateEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = BaseEvent<TTypeConfiguration> & {
    readonly action: 'UPDATE';
    readonly properties: Simplify<SetRequired<TProperties, TPrimaryKeys>>;
    readonly previousProperties: Simplify<
        SetRequired<TProperties, TPrimaryKeys>
    >;
};

export type UpdateCallbackEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = UpdateEvent<TProperties, TTypeConfiguration, TPrimaryKeys> & {
    readonly callbackContext: Record<string, string>;
};

export type DeleteEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = BaseEvent<TTypeConfiguration> & {
    readonly action: 'DELETE';
    readonly properties: Simplify<SetRequired<TProperties, TPrimaryKeys>>;
};

export type ReadEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = BaseEvent<TTypeConfiguration> & {
    readonly action: 'READ';
    readonly properties: Simplify<Pick<TProperties, TPrimaryKeys>>;
};

export type ListEvent<TTypeConfiguration extends Input> =
    BaseEvent<TTypeConfiguration> & {
        readonly action: 'LIST';
        // List can apparently be filters w/ properties, but it's not clear what that means?
        readonly properties: unknown;
    };

export type SuccessWithPropertiesResult<
    TProperties extends Input,
    TPrimaryKeys extends keyof TProperties
> = {
    readonly Status: OperationStatus.Success;
    readonly Properties: Simplify<SetRequired<TProperties, TPrimaryKeys>>;
};

export type InProgress<
    TProperties extends Input,
    TPrimaryKeys extends keyof TProperties
> = {
    readonly Status: OperationStatus.InProgress;
    readonly Properties: Simplify<SetRequired<TProperties, TPrimaryKeys>>;
    readonly CallbackContext: Record<string, string>;
    readonly CallbackDelaySeconds: number;
    readonly Message?: string;
    readonly ErrorCode?: string;
};

export type PendableSuccessResult<
    TProperties extends Input,
    TPrimaryKeys extends keyof TProperties
> =
    | SuccessWithPropertiesResult<TProperties, TPrimaryKeys>
    | InProgress<TProperties, TPrimaryKeys>;

export type DeleteResult<
    TProperties extends Input,
    TPrimaryKeys extends keyof TProperties
> = InProgress<TProperties, TPrimaryKeys> | { Status: OperationStatus.Success };

export type ListResult<
    TProperties extends Input,
    TPrimaryKeys extends keyof TProperties,
    TAdditionalKeys extends keyof TProperties
> = {
    readonly Status: OperationStatus.Success;
    readonly ResourceIds: SetRequired<
        Pick<TProperties, TPrimaryKeys | TAdditionalKeys>,
        TPrimaryKeys
    >[];
    readonly NextToken: string | null;
};
