/* tslint:disable */
/* eslint-disable */
import { ResourceBuilderBase } from '@amazon-web-services-cloudformation/cloudformation-cli-typescriptv2-lib';
import { type TypeOf } from 'suretype';
import type { CamelCasedPropertiesDeep } from 'type-fest';
import type { ConditionalSimplifyDeep } from 'type-fest/source/conditional-simplify.js';
import { schemaResourceProperties, schemaTypeConfiguration } from './schema.js';

export const TypeName = 'Test::Test::Test';

export const PrimaryIds = ['TPSCode'] as const;
export type PrimaryId = typeof PrimaryIds[number];

export type PropertiesSchema = typeof schemaResourceProperties;
export type TypeConfigurationSchema = typeof schemaTypeConfiguration;

export class ResourceBuilder extends ResourceBuilderBase<
    PropertiesSchema,
    TypeConfigurationSchema,
    PrimaryId
> {
    constructor() {
        super({
            typeName: TypeName,
            schema: schemaResourceProperties.additional(false),
            typeConfigurationSchema: schemaTypeConfiguration.additional(false),
            ids: PrimaryIds,
        });
    }
}

export const resourceBuilder = new ResourceBuilder();

export type RawProperties = ConditionalSimplifyDeep<
    TypeOf<typeof schemaResourceProperties>
>;
export type Properties = CamelCasedPropertiesDeep<RawProperties>;

export type RawTypeConfiguration = ConditionalSimplifyDeep<
    TypeOf<typeof schemaTypeConfiguration>
>;
export type TypeConfiguration = CamelCasedPropertiesDeep<RawTypeConfiguration>;

export * from './schema.js';
