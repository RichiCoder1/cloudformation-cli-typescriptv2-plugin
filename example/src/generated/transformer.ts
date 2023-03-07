/* tslint:disable */
/* eslint-disable */
/**
 * This file is generated by quicktype on behalf of cloudformation-cli-typescript-plugin, DO NOT EDIT.
 * For more information, see:
 *  - {@link https://github.com/quicktype/quicktype}
 *  - {@link https://github.com/aws-cloudformation/cloudformation-cli-typescript-plugin}
 */
// To parse this data:
//
//   import { Convert, TransformedResourceProperties, TransformedTypeConfiguration } from "./file";
//
//   const transformedResourceProperties = Convert.toTransformedResourceProperties(json);
//   const transformedTypeConfiguration = Convert.toTransformedTypeConfiguration(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

/**
 * An example resource schema demonstrating some basic constructs and validation rules.
 */
export interface TransformedResourceProperties {
    approvalDate?: Date;
    authors?:      string[];
    /**
     * Required for all TPS Reports submitted after 2/19/1999
     */
    coverSheetIncluded?: boolean;
    dueDate?:            Date;
    memo?:               Memo;
    multipliers?:        number[] | null;
    /**
     * In case you didn't get the first one.
     */
    secondCopyOfMemo?: Memo;
    /**
     * An array of key-value pairs to apply to this resource.
     */
    tags?:    Tag[];
    testCode: TestCode;
    /**
     * The title of the TPS report is a mandatory element.
     */
    title: string;
    /**
     * A TPS Code is automatically generated on creation and assigned as the unique identifier.
     */
    tpsCode?: string;
}

/**
 * In case you didn't get the first one.
 */
export interface Memo {
    body?:    string;
    heading?: string;
}

/**
 * A key-value pair to associate with a resource.
 */
export interface Tag {
    /**
     * The key name of the tag. You can specify a value that is 1 to 128 Unicode characters in
     * length and cannot be prefixed with aws:. You can use any of the following characters: the
     * set of Unicode letters, digits, whitespace, _, ., /, =, +, and -.
     */
    key: string;
    /**
     * The value for the tag. You can specify a value that is 0 to 256 Unicode characters in
     * length and cannot be prefixed with aws:. You can use any of the following characters: the
     * set of Unicode letters, digits, whitespace, _, ., /, =, +, and -.
     */
    value: string;
}

export type TestCode = "NOT_STARTED" | "CANCELLED";

export interface TransformedTypeConfiguration {
    apiKey?: string;
    [property: string]: any;
}

// Converts JSON types to/from your types
// and asserts the results at runtime
export class Convert {
    public static toTransformedResourceProperties(json: any): TransformedResourceProperties {
        return cast(json, r("TransformedResourceProperties"));
    }

    public static transformedResourcePropertiesToJson(value: TransformedResourceProperties): any {
        return uncast(value, r("TransformedResourceProperties"));
    }

    public static toMemo(json: any): Memo {
        return cast(json, r("Memo"));
    }

    public static memoToJson(value: Memo): any {
        return uncast(value, r("Memo"));
    }

    public static toTag(json: any): Tag {
        return cast(json, r("Tag"));
    }

    public static tagToJson(value: Tag): any {
        return uncast(value, r("Tag"));
    }

    public static toTransformedTypeConfiguration(json: any): TransformedTypeConfiguration {
        return cast(json, r("TransformedTypeConfiguration"));
    }

    public static transformedTypeConfigurationToJson(value: TransformedTypeConfiguration): any {
        return uncast(value, r("TransformedTypeConfiguration"));
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [] as any[], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "TransformedResourceProperties": o([
        { json: "ApprovalDate", js: "approvalDate", typ: u(undefined, Date) },
        { json: "Authors", js: "authors", typ: u(undefined, a("")) },
        { json: "CoverSheetIncluded", js: "coverSheetIncluded", typ: u(undefined, true) },
        { json: "DueDate", js: "dueDate", typ: u(undefined, Date) },
        { json: "Memo", js: "memo", typ: u(undefined, r("Memo")) },
        { json: "Multipliers", js: "multipliers", typ: u(undefined, u(a(3.14), null)) },
        { json: "SecondCopyOfMemo", js: "secondCopyOfMemo", typ: u(undefined, r("Memo")) },
        { json: "Tags", js: "tags", typ: u(undefined, a(r("Tag"))) },
        { json: "TestCode", js: "testCode", typ: r("TestCode") },
        { json: "Title", js: "title", typ: "" },
        { json: "TPSCode", js: "tpsCode", typ: u(undefined, "") },
    ], false),
    "Memo": o([
        { json: "Body", js: "body", typ: u(undefined, "") },
        { json: "Heading", js: "heading", typ: u(undefined, "") },
    ], false),
    "Tag": o([
        { json: "Key", js: "key", typ: "" },
        { json: "Value", js: "value", typ: "" },
    ], false),
    "TransformedTypeConfiguration": o([
        { json: "ApiKey", js: "apiKey", typ: u(undefined, "") },
    ], "any"),
    "TestCode": [
        "CANCELLED",
        "NOT_STARTED",
    ],
};
