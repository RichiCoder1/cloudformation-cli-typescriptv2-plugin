/* tslint:disable */
/* eslint-disable */
/**
 * This file is generated by core-types-suretype on behalf of cfn-cli-typescriptv2-plugin, DO NOT EDIT.
 * For more information, see:
 *  - {@link https://github.com/grantila/core-types-suretype}
 *  - {@link https://github.com/richicoder1/cloudformation-cli-typescriptv2-plugin}
 */

import { suretype, v, annotate } from 'suretype';

/** The validation schema for a TypeConfiguration */
export const schemaTypeConfiguration = suretype(
    {
        name: 'TypeConfiguration',
    },
    v.object({})
);

export interface TypeConfiguration {}

/** The validation schema for a Tag */
export const schemaTag = suretype(
    {
        name: 'Tag',
        description: 'A key-value pair to associate with a resource.',
    },
    v.object({
        Key: annotate(
            {
                description:
                    'The key name of the tag. You can specify a value that is 1 to 128 Unicode characters in length and cannot be prefixed with aws:. You can use any of the following characters: the set of Unicode letters, digits, whitespace, _, ., /, =, +, and -.',
            },
            v.string().required()
        ),
        Value: annotate(
            {
                description:
                    'The value for the tag. You can specify a value that is 0 to 256 Unicode characters in length and cannot be prefixed with aws:. You can use any of the following characters: the set of Unicode letters, digits, whitespace, _, ., /, =, +, and -.',
            },
            v.string().required()
        ),
    })
);

/** A key-value pair to associate with a resource. */
export interface Tag {
    /** The key name of the tag. You can specify a value that is 1 to 128 Unicode characters in length and cannot be prefixed with aws:. You can use any of the following characters: the set of Unicode letters, digits, whitespace, _, ., /, =, +, and -. */
    Key: string;
    /** The value for the tag. You can specify a value that is 0 to 256 Unicode characters in length and cannot be prefixed with aws:. You can use any of the following characters: the set of Unicode letters, digits, whitespace, _, ., /, =, +, and -. */
    Value: string;
}

/** The validation schema for a Memo */
export const schemaMemo = suretype(
    {
        name: 'Memo',
    },
    v.object({
        Heading: v.string(),
        Body: v.string(),
    })
);

export interface Memo {
    Heading?: string;
    Body?: string;
}

/** The validation schema for a InitechDateFormat */
export const schemaInitechDateFormat = suretype(
    {
        name: 'InitechDateFormat',
    },
    v.string()
);

export type InitechDateFormat = string;

/** The validation schema for a ResourceProperties */
export const schemaResourceProperties = suretype(
    {
        name: 'ResourceProperties',
        description:
            'An example resource schema demonstrating some basic constructs and validation rules.',
    },
    v.object({
        TPSCode: annotate(
            {
                description:
                    'A TPS Code is automatically generated on creation and assigned as the unique identifier.',
            },
            v.string()
        ),
        Title: annotate(
            {
                description:
                    'The title of the TPS report is a mandatory element.',
            },
            v.string().required()
        ),
        CoverSheetIncluded: annotate(
            {
                description:
                    'Required for all TPS Reports submitted after 2/19/1999',
            },
            v.boolean()
        ),
        DueDate: schemaInitechDateFormat,
        ApprovalDate: schemaInitechDateFormat,
        Memo: schemaMemo,
        SecondCopyOfMemo: schemaMemo,
        TestCode: v.string().enum('NOT_STARTED', 'CANCELLED').required(),
        Authors: v.array(v.string()),
        Tags: annotate(
            {
                description:
                    'An array of key-value pairs to apply to this resource.',
            },
            v.array(schemaTag)
        ),
    })
);

/** An example resource schema demonstrating some basic constructs and validation rules. */
export interface ResourceProperties {
    /** A TPS Code is automatically generated on creation and assigned as the unique identifier. */
    TPSCode?: string;
    /** The title of the TPS report is a mandatory element. */
    Title: string;
    /** Required for all TPS Reports submitted after 2/19/1999 */
    CoverSheetIncluded?: boolean;
    DueDate?: InitechDateFormat;
    ApprovalDate?: InitechDateFormat;
    Memo?: Memo;
    SecondCopyOfMemo?: Memo;
    TestCode: 'NOT_STARTED' | 'CANCELLED';
    Authors?: string[];
    /** An array of key-value pairs to apply to this resource. */
    Tags?: Tag[];
}
