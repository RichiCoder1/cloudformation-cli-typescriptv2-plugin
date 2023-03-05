import { BaseRequest } from '~/event.js';
import { CoreValidator, TypeOf } from 'suretype';
import { Logger } from 'pino';
import {
    PartialDeep,
    SetRequired,
    Simplify,
    CamelCasedPropertiesDeep,
} from 'type-fest';

// I apologize to anyone who has to read this code.
// TypeScript requires some crazy work for a good dev experience.

export type OnCreateEvent<
    TProperties extends CoreValidator<unknown>,
    TTypeConfiguration extends CoreValidator<unknown>,
    TPrimaryKeys extends keyof TypeOf<TProperties> = never
> = {
    readonly requestType: 'Create';
    readonly request: BaseRequest;
    readonly properties: Simplify<
        Omit<CamelCasedPropertiesDeep<TypeOf<TProperties>>, TPrimaryKeys>
    >;
    readonly logger: Logger;
    readonly typeConfiguration: CamelCasedPropertiesDeep<
        TypeOf<TTypeConfiguration>
    >;
};

export type SuccessWithProperties<
    TProperties extends CoreValidator<unknown>,
    TPrimaryKeys extends keyof TypeOf<TProperties>
> = {
    readonly status: 'SUCCESS';
    readonly properties: Simplify<
        CamelCasedPropertiesDeep<SetRequired<TypeOf<TProperties>, TPrimaryKeys>>
    >;
};

export type SuccessWithCallback<TProperties extends CoreValidator<unknown>> = {
    readonly status: 'IN_PROGRESS';
    readonly properties: Simplify<
        PartialDeep<CamelCasedPropertiesDeep<TypeOf<TProperties>>>
    >;
    readonly callbackContext: Record<string, string>;
};

export type OnCreateResult<
    TProperties extends CoreValidator<unknown>,
    TPrimaryKeys extends keyof TypeOf<TProperties>
> =
    | SuccessWithProperties<TProperties, TPrimaryKeys>
    | SuccessWithCallback<TProperties>;
