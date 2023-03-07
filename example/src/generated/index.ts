/* tslint:disable */
/* eslint-disable */
import { ResourceBuilderBase } from '@amazon-web-services-cloudformation/cloudformation-cli-typescriptv2-lib';
import { schemaResourceProperties, schemaTypeConfiguration } from './schema.js';
import {
    Convert,
    TransformedResourceProperties,
    TransformedTypeConfiguration,
} from './transformer.js';

export const TypeName = 'Test::Test::Test';

export const PrimaryIds = ['tpsCode'] as const;
export type PrimaryId = typeof PrimaryIds[number];

export type PropertiesSchema = typeof schemaResourceProperties;
export type TypeConfigurationSchema = typeof schemaTypeConfiguration;

export class ResourceBuilder extends ResourceBuilderBase<
    PropertiesSchema,
    TypeConfigurationSchema,
    PrimaryId,
    TransformedResourceProperties,
    TransformedTypeConfiguration
> {
    constructor() {
        super({
            typeName: TypeName,
            schema: schemaResourceProperties.additional(false),
            typeConfigurationSchema: schemaTypeConfiguration.additional(false),
            ids: PrimaryIds,
            transformProperties: {
                toJS: Convert.toTransformedResourceProperties,
                fromJS: Convert.transformedResourcePropertiesToJson,
            },
            transformTypeConfiguration: {
                toJS: Convert.toTransformedTypeConfiguration,
                fromJS: Convert.transformedTypeConfigurationToJson,
            },
        });
    }
}

export const resourceBuilder = new ResourceBuilder();

export * from './schema.js';
