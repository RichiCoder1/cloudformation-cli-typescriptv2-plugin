import { BaseRequest } from '~/event';
import { v, CoreValidator, TypeOf } from 'suretype';
import { CamelCaseKeys } from 'camelcase-keys';
import { Logger } from 'pino';
import { PartialDeep, SetRequired } from 'type-fest';

export type OnCreateEvent<
    TProperties extends CoreValidator<unknown>,
    TTypeConfiguration extends CoreValidator<unknown>,
    TPrimaryKeys extends keyof TypeOf<TProperties> = never
> = {
    readonly requestType: 'Create';
    readonly request: BaseRequest;
    readonly properties: Omit<
        CamelCaseKeys<TypeOf<TProperties>, true>,
        TPrimaryKeys
    >;
    readonly logger: Logger;
    readonly typeConfiguration: CamelCaseKeys<TypeOf<TTypeConfiguration>, true>;
};

export type SuccessWithProperties<TProperties extends CoreValidator<unknown>> =
    {
        readonly status: 'SUCCESS';
        readonly properties: CamelCaseKeys<TypeOf<TProperties>, true>;
    };

export type SuccessWithCallback<TProperties extends CoreValidator<unknown>> = {
    readonly status: 'IN_PROGRESS';
    readonly properties: PartialDeep<CamelCaseKeys<TypeOf<TProperties>, true>>;
    readonly callbackContext: Record<string, string>;
};

export type OnCreateResult<TProperties extends CoreValidator<unknown>> =
    | SuccessWithProperties<TProperties>
    | SuccessWithCallback<TProperties>;
