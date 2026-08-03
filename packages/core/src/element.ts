export type StyleValue = string | number;

/**
 * satori accepts only `flex`, `contents`, and `none`. Everything else throws at render
 * time with an error that does not name the offending element, so `display` is typed
 * narrowly here to move that failure to compile time. The index signature leaves the
 * rest of CSS open on purpose: enumerating satori's supported properties would be a
 * second source of truth that drifts from the version actually installed.
 */
export interface Style {
  display?: 'flex' | 'contents' | 'none';
  [property: string]: StyleValue | undefined;
}

export type Child = Element | string | number | false | null | undefined;

export interface ElementProps {
  style?: Style;
  children?: Child | readonly Child[];
  [prop: string]: unknown;
}

export interface Element {
  type: string;
  props: ElementProps;
}

/**
 * satori renders plain `{type, props}` objects, so blocks need neither React nor a JSX
 * transform. That keeps React out of the dependency graph of every package that builds
 * an element, which the install-size gate depends on.
 */
export const h = (type: string, props: ElementProps | null, ...children: Child[]): Element => {
  const rendered = children.filter(
    (child): child is Element | string | number =>
      child !== null && child !== undefined && child !== false,
  );

  const base = props ?? {};
  return rendered.length === 0
    ? { type, props: base }
    : { type, props: { ...base, children: rendered } };
};
