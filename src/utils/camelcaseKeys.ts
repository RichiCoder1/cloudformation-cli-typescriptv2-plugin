/** eslint-disable */
/***
 * Source: https://github.com/sindresorhus/camelcase-keys/blob/main/index.js
 * 
 * MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE
 */

import mapObject from 'map-obj';
import camelCase from 'camelcase';
import QuickLru from 'quick-lru';
import type originalCamelCase from 'camelcase-keys';

const has = (array, key) =>
    array.some((element) => {
        if (typeof element === 'string') {
            return element === key;
        }

        element.lastIndex = 0;

        return element.test(key);
    });

const cache = new QuickLru({ maxSize: 100_000 });

// Reproduces behavior from `map-obj`.
const isObject = (value) =>
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof RegExp) &&
    !(value instanceof Error) &&
    !(value instanceof Date);

type Options = Parameters<typeof originalCamelCase>[1] & {
    preserveConsecutiveUppercase?: boolean;
};

const transform = (input: any, options: Options = {}) => {
    if (!isObject(input)) {
        return input;
    }

    const {
        exclude,
        pascalCase = false,
        stopPaths,
        deep = false,
        preserveConsecutiveUppercase,
    } = options;

    const stopPathsSet = new Set(stopPaths);

    const makeMapper =
        (parentPath) =>
        (key: any, value: any): any => {
            if (deep && isObject(value)) {
                const path =
                    parentPath === undefined ? key : `${parentPath}.${key}`;

                if (!stopPathsSet.has(path)) {
                    value = mapObject(value, makeMapper(path));
                }
            }

            if (!(exclude && has(exclude, key))) {
                const cacheKey = pascalCase ? `${key}_` : key;

                if (cache.has(cacheKey)) {
                    key = cache.get(cacheKey);
                } else {
                    const returnValue = camelCase(key, {
                        pascalCase,
                        locale: false,
                        preserveConsecutiveUppercase,
                    });

                    if (key.length < 100) {
                        // Prevent abuse
                        cache.set(cacheKey, returnValue);
                    }

                    key = returnValue;
                }
            }

            return [key, value];
        };

    return mapObject(input, makeMapper(undefined));
};

export default function camelcaseKeys(
    input: Parameters<typeof originalCamelCase>[0],
    options?: Options
): any {
    if (Array.isArray(input)) {
        return Object.keys(input).map((key) => transform(input[key], options));
    }

    return transform(input, options);
}
