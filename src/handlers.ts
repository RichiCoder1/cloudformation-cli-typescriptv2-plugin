import { Action } from './request.js';
import { OperationStatus } from './response.js';
import { BaseRequest } from '~/request.js';
import { Logger } from 'pino';
import {
    PartialDeep,
    SetRequired,
    Simplify,
    CamelCasedPropertiesDeep,
} from 'type-fest';
import { Input } from './types.js';

// I apologize to anyone who has to read this code.
// TypeScript requires some crazy work for a good dev experience.

export type BaseEvent<TTypeConfiguration extends Input> = {
    readonly action: Action;
    readonly logger: Logger;
    readonly typeConfiguration: CamelCasedPropertiesDeep<TTypeConfiguration>;
};

export type CreateEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = BaseEvent<TTypeConfiguration> & {
    readonly action: 'CREATE';
    readonly properties: Simplify<
        CamelCasedPropertiesDeep<Omit<TProperties, TPrimaryKeys>>
    >;
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
    readonly properties: Simplify<
        CamelCasedPropertiesDeep<SetRequired<TProperties, TPrimaryKeys>>
    >;
    readonly previousProperties: Simplify<
        CamelCasedPropertiesDeep<SetRequired<TProperties, TPrimaryKeys>>
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
    readonly properties: Simplify<
        CamelCasedPropertiesDeep<SetRequired<TProperties, TPrimaryKeys>>
    >;
};

export type ReadEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = BaseEvent<TTypeConfiguration> & {
    readonly action: 'READ';
    readonly properties: Simplify<
        CamelCasedPropertiesDeep<Pick<TProperties, TPrimaryKeys>>
    >;
};

export type ListEvent<
    TProperties extends Input,
    TTypeConfiguration extends Input,
    TPrimaryKeys extends keyof TProperties
> = BaseEvent<TTypeConfiguration> & {
    readonly action: 'LIST';
    // List can apparently be filters w/ properties, but it's not clear what that means?
};

export type SuccessWithPropertiesResult<
    TProperties extends Input,
    TPrimaryKeys extends keyof TProperties
> = {
    readonly Status: OperationStatus.Success;
    readonly Properties: Simplify<
        CamelCasedPropertiesDeep<SetRequired<TProperties, TPrimaryKeys>>
    >;
};

export type InProgress<TProperties extends Input> = {
    readonly Status: OperationStatus.InProgress;
    readonly Properties: Simplify<
        PartialDeep<CamelCasedPropertiesDeep<TProperties>>
    >;
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
    | InProgress<TProperties>;

export type DeleteResult<TProperties extends Input> =
    | InProgress<TProperties>
    | { Status: OperationStatus.Success };

export type ListResult<
    TProperties extends Input,
    TPrimaryKeys extends keyof TProperties
> = {
    readonly Status: OperationStatus.Success;
    readonly ResourceModels: CamelCasedPropertiesDeep<
        Pick<TProperties, TPrimaryKeys>
    >[];
    readonly NextToken: string | null;
};
