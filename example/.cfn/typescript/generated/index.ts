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

export const PrimaryIds = [
  'tpsCode'
] as const;
export type PrimaryId = typeof PrimaryIds[number];

export const AdditionalIds = [
  
] as const;
export type AdditionalId = typeof AdditionalIds[number];

export const MapIds = {
  "tpsCode": "TPSCode"
} as const;

export type PropertiesSchema = typeof schemaResourceProperties;
export type TypeConfigurationSchema = typeof schemaTypeConfiguration;

export class ResourceBuilder extends ResourceBuilderBase<
    PropertiesSchema,
    TypeConfigurationSchema,
    PrimaryId,
    AdditionalId,
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
          transformIds: {
              fromJS: (ids: Record<PrimaryId | AdditionalId, unknown>) => {
                  const result: Record<typeof MapIds[keyof typeof MapIds], unknown> = {} as any;
                  for (const [key, value] of Object.entries(ids)) {
                      const mapKey = MapIds[key as PrimaryId | AdditionalId];
                      if (!mapKey) {
                          throw new Error(
                              `Unknown id ${key}. Make sure you're only setting id properties on the result.`
                          );
                      }
                      result[mapKey] = value;
                  }
                  return result;
              },
          },
      });
  }
}

export const resourceBuilder = new ResourceBuilder();

export * from './schema.js';