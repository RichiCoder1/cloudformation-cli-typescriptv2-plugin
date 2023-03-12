/* tslint:disable */
/* eslint-disable */
import { ResourceBuilderBase } from '@amazon-web-services-cloudformation/cloudformation-cli-typescriptv2-lib';
import { schemaResourceProperties, schemaTypeConfiguration, ResourceProperties, TypeConfiguration } from './schema.js';

export const TypeName = 'Test::Test::Test';

export const PrimaryIds = [
  'TPSCode'
] as const;
export type PrimaryId = typeof PrimaryIds[number];

export const AdditionalIds = [
  
] as const;
export type AdditionalId = typeof AdditionalIds[number];

export type PropertiesSchema = typeof schemaResourceProperties;
export type TypeConfigurationSchema = typeof schemaTypeConfiguration;

export class ResourceBuilder extends ResourceBuilderBase<
    PropertiesSchema,
    TypeConfigurationSchema,
    PrimaryId,
    AdditionalId,
    ResourceProperties,
    TypeConfiguration
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

export * from './schema.js';