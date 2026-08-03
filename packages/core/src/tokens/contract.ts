export interface FontFile {
  path: string;
  weight: number;
  style?: 'normal' | 'italic';
}

/**
 * satori needs a real buffer per weight, not a CSS family name, and substitutes silently
 * when one is missing. Weights are therefore enumerated rather than implied.
 */
export interface FontSource {
  family: string;
  files: readonly FontFile[];
}

export interface TypeStyle {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: string;
  textTransform?: 'uppercase' | 'none';
}

export interface FontTokens {
  display: FontSource;
  body: FontSource;
}

/**
 * What a consumer writes in `mediakit.config.ts`. Only `color.accent` is required: it is
 * the one value a neutral default cannot fake, where a wrong-but-neutral page color still
 * reads as unstyled rather than as somebody else's brand.
 */
export interface TokensInput {
  color: Record<string, string> & { accent: string };
  font?: Partial<FontTokens>;
  type?: Record<string, TypeStyle>;
  space?: Record<string, number>;
  radius?: Record<string, number>;
  scale?: number;
}

/**
 * What a block receives. `scale` is deliberately absent rather than carried through: it
 * has already been applied, so a block reading it would be reading a number that no longer
 * means anything. Its absence is what makes passing raw `TokensInput` to a block a type
 * error instead of a silently cramped render.
 */
export interface ResolvedTokens {
  color: Record<string, string>;
  font: FontTokens;
  type: Record<string, TypeStyle>;
  space: Record<string, number>;
  radius: Record<string, number>;
}
