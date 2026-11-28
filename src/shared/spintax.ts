/**
 * Spintax Parser & Expander
 * Supports: {opt1|opt2|opt3}, nested: {Hello|Hi} {world|everyone}
 * Optional weighted: {opt1:50|opt2:30|opt3:20}
 */

export type SpintaxNode =
  { type: 'text'; value: string } | { type: 'spin'; options: SpintaxOption[] };

export interface SpintaxOption {
  weight: number;
  nodes: SpintaxNode[];
}

const DEFAULT_WEIGHT = 1;

export function parseSpintax(text: string): SpintaxNode[] {
  const nodes: SpintaxNode[] = [];
  let currentText = '';
  let depth = 0;
  let optionStart = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '{' && depth === 0) {
      // Start of spin block
      if (currentText) {
        nodes.push({ type: 'text', value: currentText });
        currentText = '';
      }
      depth = 1;
      optionStart = i + 1;
      continue;
    }

    if (depth > 0) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // End of spin block - parse options
          const optionText = text.slice(optionStart, i);
          const options = parseSpinOptions(optionText);
          nodes.push({ type: 'spin', options });
          optionStart = i + 1;
        }
      }
      continue;
    }

    // Regular text
    currentText += char;
  }

  if (currentText) {
    nodes.push({ type: 'text', value: currentText });
  }

  return nodes;
}

function parseSpinOptions(text: string): SpintaxOption[] {
  const options: SpintaxOption[] = [];
  let currentOption = '';
  let depth = 0;

  for (let i = 0; i <= text.length; i++) {
    const char = text[i];

    if (char === '{') {
      depth++;
      currentOption += char;
    } else if (char === '}') {
      depth--;
      currentOption += char;
    } else if ((char === '|' && depth === 0) || char === undefined) {
      // End of option
      const parsed = parseOption(currentOption);
      options.push(parsed);
      currentOption = '';
      continue;
    } else {
      if (char !== undefined) {
        currentOption += char;
      }
    }
  }

  return options;
}

function parseOption(text: string): SpintaxOption {
  // Check for weight suffix: {option:weight}
  const weightMatch = text.match(/^(.+):(\d+(\.\d+)?)$/);
  if (weightMatch) {
    const [, optionText, weightStr] = weightMatch;
    return {
      weight: parseFloat(weightStr),
      nodes: parseSpintax(optionText),
    };
  }
  return {
    weight: DEFAULT_WEIGHT,
    nodes: parseSpintax(text),
  };
}

export function expandSpintax(ast: SpintaxNode[], rng: () => number = Math.random): string {
  return ast.map(node => expandNode(node, rng)).join('');
}

function expandNode(node: SpintaxNode, rng: () => number): string {
  if (node.type === 'text') {
    return node.value;
  }

  // Weighted random selection
  const totalWeight = node.options.reduce((sum, opt) => sum + opt.weight, 0);
  let random = rng() * totalWeight;

  for (const option of node.options) {
    random -= option.weight;
    if (random <= 0) {
      return expandSpintax(option.nodes, rng);
    }
  }

  // Fallback (shouldn't happen)
  return expandSpintax(node.options[0]?.nodes ?? [], rng);
}

export function hasSpintax(text: string): boolean {
  return /\{[^{}]*\|[^{}]*\}/.test(text);
}

export function getSpintaxVariations(text: string, maxVariations = 10): string[] {
  const ast = parseSpintax(text);
  const variations = new Set<string>();

  // Generate up to maxVariations unique expansions
  for (let i = 0; i < maxVariations * 3 && variations.size < maxVariations; i++) {
    variations.add(expandSpintax(ast));
  }

  return Array.from(variations);
}
