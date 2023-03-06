import { TypeOf, v } from 'suretype';
import { SimplifyDeep } from 'type-fest/source/merge-deep.js';

export enum OperationStatus {
    Pending = 'PENDING',
    InProgress = 'IN_PROGRESS',
    Success = 'SUCCESS',
    Failed = 'FAILED',
}

/**
 * Standard error codes for the handler response
 * @link https://docs.aws.amazon.com/cloudformation-cli/latest/userguide/resource-type-test-contract-errors.html
 */
export enum HandlerErrorCode {
    NotUpdatable = 'NotUpdatable',
    InvalidRequest = 'InvalidRequest',
    AccessDenied = 'AccessDenied',
    InvalidCredentials = 'InvalidCredentials',
    AlreadyExists = 'AlreadyExists',
    NotFound = 'NotFound',
    ResourceConflict = 'ResourceConflict',
    Throttling = 'Throttling',
    ServiceLimitExceeded = 'ServiceLimitExceeded',
    NotStabilized = 'NotStabilized',
    GeneralServiceException = 'GeneralServiceException',
    ServiceInternalError = 'ServiceInternalError',
    NetworkFailure = 'NetworkFailure',
    InternalFailure = 'InternalFailure',
    InvalidTypeConfiguration = 'InvalidTypeConfiguration',
}

export const BaseResponseSchema = v.object({
    Status: v
        .string()
        .enum(...Object.values(OperationStatus))
        .required(),
    ErrorCode: v.string().enum(...Object.values(HandlerErrorCode)),
    Message: v.string(),
    ResourceModel: v.any(),
    ResourceModels: v.array(v.any()),
    NextToken: v.string(),
});

export const CfnResponseSchema = v.anyOf([
    // Create/Update/Read/Delete Complete
    v.object({
        Status: v.string().const(OperationStatus.Success).required(),
        // This is required for everything but delete, but we can't express that here
        ResourceModel: v.any(),
    }),
    // Create/Update/Delete In Progress
    v.object({
        Status: v.string().const(OperationStatus.InProgress).required(),
        Message: v.string(),
        ErrorCode: v.string(),
        CallbackContext: v.object({}).additional(v.string()).required(),
        ResourceModel: v.any(),
    }),
    // List
    v.object({
        Status: v.string().const(OperationStatus.Success).required(),
        ResourceModels: v.array(v.any()).required(),
        NextToken: v.string(),
    }),
    // Failed
    v.object({
        Status: v.string().const(OperationStatus.Failed).required(),
        ErrorCode: v.string().required(),
        Message: v.string().required(),
    }),
]);

export type CfnResponse = SimplifyDeep<TypeOf<typeof CfnResponseSchema>>;

export type BaseResponse = TypeOf<typeof BaseResponseSchema>;
