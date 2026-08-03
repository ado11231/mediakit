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
 *
 * A lone child is passed through as itself rather than as a one-element array. This is not
 * cosmetic: satori does not unwrap single-element arrays, so `children: ['text']` counts as
 * more than one child and throws "Expected <div> to have explicit display: flex" on markup
 * that plainly has one child. Verified against satori 0.29.
 */
export const h = (type: string, props: ElementProps | null, ...children: Child[]): Element => {
  const rendered = children.filter(
    (child): child is Element | string | number =>
      child !== null && child !== undefined && child !== false,
  );

  const base = props ?? {};
  if (rendered.length === 0) return { type, props: base };

  const [only] = rendered;
  return {
    type,
    props: { ...base, children: rendered.length === 1 && only !== undefined ? only : rendered },
  };
};
