import { v, TypeOf } from 'suretype';

// We all additional properties to be true on all of these to support forward evolution and not accidentally break providers.

export const ActionType = v
    .string()
    .enum('CREATE', 'READ', 'UPDATE', 'DELETE', 'LIST');

export type Action = TypeOf<typeof ActionType>;

const Tags = v.object({}).additional(v.string());

const Credentials = v
    .object({
        AccessKeyId: v.string(),
        SecretAccessKey: v.string(),
        SessionToken: v.string(),
    })
    .additional(true);

export const RequestContextSchema = v
    .object({
        Invocation: v.number(),
        CallbackContext: v.any(),
        CloudWatchEventsRuleName: v.string(),
        CloudWatchEventsTargetId: v.string(),
    })
    .additional(true);

export const RequestData = v
    .object({
        LogicalResourceId: v.string(),
        CallerCredentials: Credentials,
        ProviderCredentials: Credentials,
        ResourceProperties: v.any(),
        OldResourceProperties: v.any(),
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
        Action: ActionType,
        ResourceType: v.string().required(),
        ResourceTypeVersion: v.string(),
        RequestType: v.string().required(),
        CallbackContext: v.any(),
        RequestContext: RequestContextSchema,
        RequestData: RequestData,
        NextToken: v.string(),
    })
    .additional(true);
