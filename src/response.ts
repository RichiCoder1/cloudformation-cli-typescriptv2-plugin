import { TypeOf, v } from 'suretype';

export enum OperationStatus {
    Pending = 'PENDING',
    InProgress = 'IN_PROGRESS',
    Success = 'SUCCESS',
    Failed = 'FAILED',
}

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
    Status: v.string().enum(...Object.values(OperationStatus)),
    ErrorCode: v.string().enum(...Object.values(HandlerErrorCode)),
    Message: v.string(),
    ResourceModel: v.any(),
    ResourceModels: v.array(v.any()),
    NextToken: v.string(),
});

export type BaseResponse = TypeOf<typeof BaseResponseSchema>;
