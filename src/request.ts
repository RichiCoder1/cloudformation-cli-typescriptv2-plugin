import { v, TypeOf, ensure, compile } from 'suretype';

// We all additional properties to be true on all of these to support forward evolution and not accidentally break providers.

export const ActionType = v
    .string()
    .enum('CREATE', 'READ', 'UPDATE', 'DELETE', 'LIST');

export type Action = TypeOf<typeof ActionType>;

const Tags = v.object({}).additional(v.string());

const CredentialsSchema = v.object({
    AccessKeyId: v.string().required(),
    SecretAccessKey: v.string().required(),
    SessionToken: v.string(),
});

export const RequestContextSchema = v
    .object({
        Invocation: v.number(),
        CallbackContext: v.any(),
        CloudWatchEventsRuleName: v.string(),
        CloudWatchEventsTargetId: v.string(),
    })
    .additional(true);

export const RequestDataSchema = v
    .object({
        LogicalResourceId: v.string(),
        CallerCredentials: CredentialsSchema,
        ProviderCredentials: CredentialsSchema,
        ResourceProperties: v.any(),
        PreviousResourceProperties: v.any(),
        ProviderLogGroupName: v.string(),
        SystemTags: Tags,
        StackTags: Tags,
        TypeConfiguration: v.any(),
    })
    .additional(true);

export const RequestSchema = v
    .object({
        AWSAccountId: v.string(),
        Region: v.string().required(),
        BearerToken: v.string().required(),
        Action: ActionType.required(),
        ResourceType: v.string().required(),
        ResourceTypeVersion: v.string(),
        RequestType: v.string().required(),
        CallbackContext: v.any(),
        RequestContext: RequestContextSchema,
        RequestData: RequestDataSchema.required(),
        NextToken: v.string(),
    })
    .additional(true);

export type BaseRequest = TypeOf<typeof RequestSchema>;

export const ensureBaseRequest = compile(RequestSchema, { ensure: true });
