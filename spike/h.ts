export type Style = Record<string, string | number>;

export interface Element {
  type: string;
  props: { style?: Style; children?: Child | Child[] };
}

export type Child = Element | string | null | false;

/**
 * satori accepts plain {type, props} objects, so the spike needs no React and no JSX
 * transform. Children collapse to a single value when there is one because satori
 * treats an array of length 1 the same as the element itself, and the flatter shape
 * is easier to read in a stack trace when satori throws.
 */
export const h = (type: string, style: Style, ...children: Child[]): Element => {
  const kept = children.filter((c): c is Element | string => Boolean(c));
  return {
    type,
    props: {
      style,
      ...(kept.length === 0 ? {} : { children: kept.length === 1 ? kept[0] : kept }),
    },
  };
};
