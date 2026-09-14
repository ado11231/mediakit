import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';

export async function readDesignCss(
  path: string,
  parents: string[] = [],
): Promise<{ css: string; files: string[] }> {
  if (parents.includes(path)) throw new Error(`${path}: circular CSS import.`);
  const tree = postcss.parse(await readFile(path, 'utf8'), { from: path });
  const files = [path];
  const imports: import('postcss').AtRule[] = [];
  tree.walkAtRules('import', (rule) => {
    imports.push(rule);
  });
  for (const rule of imports) {
    const match = /^(?:url\()?['"]([^'"]+)['"]\)?\s*$/.exec(rule.params);
    if (!match?.[1])
      throw new Error(
        `${path}: use a local quoted CSS import without conditions, or map a compiled CSS source.`,
      );
    if (match[1] === 'tailwindcss') {
      rule.remove();
      continue;
    }
    if (/^(https?:|\/\/)/.test(match[1]))
      throw new Error(`${path}: remote CSS imports are not supported. Use a local stylesheet.`);
    const imported = await readDesignCss(resolve(dirname(path), match[1]), [...parents, path]);
    rule.replaceWith(postcss.parse(imported.css));
    files.push(...imported.files);
  }
  tree.walkAtRules('theme', (rule) => {
    const replacement = postcss.rule({ selector: ':root' });
    for (const node of [...(rule.nodes ?? [])]) replacement.append(node);
    rule.replaceWith(replacement);
  });
  // Design resolution needs declarations, not a second utility CSS compiler.
  tree.walkAtRules((rule) => {
    if (
      ['tailwind', 'apply', 'plugin', 'config', 'source', 'custom-variant'].includes(rule.name)
    )
      rule.remove();
  });
  return { css: tree.toString(), files: [...new Set(files)] };
}
