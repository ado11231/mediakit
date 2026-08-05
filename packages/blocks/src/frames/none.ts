import { defineFrame } from '@mediakit/core';

/**
 * No chrome at all: the screen content passes through untouched. Useful when a surface wants
 * a raw screenshot with no device wrapping, or as a default a custom frame can replace.
 */
export const none = defineFrame({ still: (child) => child });
