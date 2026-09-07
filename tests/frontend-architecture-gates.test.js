import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import test from "node:test";

import ts from "typescript";

import { FRONTEND_ARCHITECTURE_MANIFEST } from "./fixtures/frontendArchitectureManifest.js";

const SRC_DIR = new URL("../src/", import.meta.url).pathname;

function readSourceFiles(directory = SRC_DIR, relativeDirectory = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    const relativePath = posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return readSourceFiles(absolutePath, relativePath);
    if (!/\.(?:js|ts|tsx)$/u.test(entry.name)) return [];
    return [{ relativePath: `src/${relativePath}`, source: readFileSync(absolutePath, "utf8") }];
  });
}

function scriptKind(relativePath) {
  if (relativePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (relativePath.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function sourceFile({ relativePath, source }) {
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, scriptKind(relativePath));
}

function nodeName(node, source) {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.name) {
    return node.name.getText(source);
  }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return null;
}

function propertyName(node, source) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (
    ts.isComputedPropertyName(node) &&
    (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
  ) {
    return node.expression.text;
  }
  return node.getText(source);
}

function memberAccess(node, source) {
  if (ts.isPropertyAccessExpression(node)) {
    return { name: node.name.text, target: node.expression.getText(source) };
  }
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return { name: node.argumentExpression.text, target: node.expression.getText(source) };
  }
  return null;
}

function valueKind(node) {
  if (ts.isStringLiteral(node)) {
    return node.text === "" ? "empty-string" : "string";
  }
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) return "template";
  if (ts.isCallExpression(node)) {
    const callee = ts.isIdentifier(node.expression) ? node.expression.text : "expression";
    return `call:${callee}`;
  }
  if (ts.isObjectLiteralExpression(node)) return "object";
  return ts.SyntaxKind[node.kind] ?? "unknown";
}

function enclosingCallTarget(node, source) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isObjectLiteralExpression(current) && ts.isCallExpression(current.parent)) {
      return current.parent.expression.getText(source);
    }
    if (ts.isFunctionLike(current)) break;
    current = current.parent;
  }
  return "property";
}

function finding(relativePath, symbols, api, target, kind) {
  return `${relativePath}::${symbols.at(-1) ?? "<top-level>"}::${api}::${target}::${kind}`;
}

function scanHtmlArchitecture(sourceFiles) {
  const renderers = [];
  const passThroughs = [];
  let astNodes = 0;

  for (const candidate of sourceFiles) {
    const parsed = sourceFile(candidate);
    const symbols = [];
    const visit = (node) => {
      astNodes += 1;
      const symbol = nodeName(node, parsed);
      if (symbol) symbols.push(symbol);

      let result = null;
      const assignedMember = ts.isBinaryExpression(node) ? memberAccess(node.left, parsed) : null;
      const calledMember = ts.isCallExpression(node) ? memberAccess(node.expression, parsed) : null;
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        assignedMember &&
        (assignedMember.name === "innerHTML" || assignedMember.name === "outerHTML")
      ) {
        result = finding(
          candidate.relativePath,
          symbols,
          assignedMember.name,
          assignedMember.target,
          valueKind(node.right)
        );
      } else if (
        ts.isCallExpression(node) &&
        calledMember &&
        ["createContextualFragment", "insertAdjacentHTML", "setHTMLUnsafe"].includes(calledMember.name)
      ) {
        result = finding(candidate.relativePath, symbols, calledMember.name, calledMember.target, "call");
      } else if (
        ts.isCallExpression(node) &&
        calledMember?.name === "write" &&
        (calledMember.target === "document" || calledMember.target.endsWith(".document"))
      ) {
        result = finding(candidate.relativePath, symbols, "document.write", calledMember.target, "call");
      } else if (
        ts.isNewExpression(node) &&
        ((ts.isIdentifier(node.expression) && node.expression.text === "DOMParser") ||
          memberAccess(node.expression, parsed)?.name === "DOMParser")
      ) {
        result = finding(candidate.relativePath, symbols, "DOMParser", "constructor", "new");
      } else if (ts.isPropertyAssignment(node) && propertyName(node.name, parsed) === "dangerouslySetInnerHTML") {
        result = finding(
          candidate.relativePath,
          symbols,
          "dangerouslySetInnerHTML",
          "property",
          valueKind(node.initializer)
        );
      } else if (ts.isJsxAttribute(node) && propertyName(node.name, parsed) === "dangerouslySetInnerHTML") {
        result = finding(candidate.relativePath, symbols, "dangerouslySetInnerHTML", "jsx", "attribute");
      } else if (
        ts.isPropertyAssignment(node) &&
        propertyName(node.name, parsed) === "html" &&
        valueKind(node.initializer) !== "empty-string"
      ) {
        result = finding(
          candidate.relativePath,
          symbols,
          "surface-html",
          enclosingCallTarget(node, parsed),
          valueKind(node.initializer)
        );
      }

      if (result) {
        if (FRONTEND_ARCHITECTURE_MANIFEST.htmlOptionPassThroughs.includes(result)) passThroughs.push(result);
        else renderers.push(result);
      }
      ts.forEachChild(node, visit);
      if (symbol) symbols.pop();
    };
    visit(parsed);
  }

  return {
    astNodes,
    files: sourceFiles.length,
    passThroughs: passThroughs.toSorted(),
    renderers: renderers.toSorted(),
  };
}

function assertHtmlArchitecture(sourceFiles) {
  const inventory = scanHtmlArchitecture(sourceFiles);
  assert.ok(inventory.files > 0, "HTML architecture scan unexpectedly found no source files");
  assert.ok(inventory.astNodes > 0, "HTML architecture scan unexpectedly parsed no AST nodes");
  assert.deepEqual(inventory.passThroughs, [...FRONTEND_ARCHITECTURE_MANIFEST.htmlOptionPassThroughs].sort());
  assert.deepEqual(inventory.renderers, [...FRONTEND_ARCHITECTURE_MANIFEST.htmlRenderers].sort());
  return inventory;
}

function controllerSources(sourceFiles) {
  return sourceFiles.filter(
    ({ relativePath }) => relativePath === "src/sessionController.ts" || relativePath.startsWith("src/controller/")
  );
}

function scanControllerDom(sourceFiles) {
  const scopedSources = controllerSources(sourceFiles);
  const apiNames = new Set(FRONTEND_ARCHITECTURE_MANIFEST.controllerDomApis);
  const findings = [];
  let astNodes = 0;

  for (const candidate of scopedSources) {
    const parsed = sourceFile(candidate);
    const visit = (node) => {
      astNodes += 1;
      if (ts.isPropertyAccessExpression(node) && apiNames.has(node.name.text)) {
        findings.push(`${candidate.relativePath}::${node.name.text}`);
      } else if (
        ts.isElementAccessExpression(node) &&
        node.argumentExpression &&
        (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)) &&
        apiNames.has(node.argumentExpression.text)
      ) {
        findings.push(`${candidate.relativePath}::${node.argumentExpression.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  }

  return { astNodes, files: scopedSources.length, findings: findings.toSorted() };
}

function assertControllerDomBoundary(sourceFiles) {
  const inventory = scanControllerDom(sourceFiles);
  assert.ok(inventory.files > 0, "controller DOM scan unexpectedly found no source files");
  assert.ok(inventory.astNodes > 0, "controller DOM scan unexpectedly parsed no AST nodes");
  assert.deepEqual(inventory.findings, []);
  return inventory;
}

function cssImports(source) {
  const parsed = ts.createSourceFile("src/main.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return parsed.statements
    .filter(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.endsWith(".css")
    )
    .map((statement) => statement.moduleSpecifier.text);
}

function assertCssImportOrder(source) {
  const imports = cssImports(source);
  assert.ok(imports.length > 0, "CSS import scan unexpectedly found no imports");
  assert.deepEqual(imports, FRONTEND_ARCHITECTURE_MANIFEST.cssImportOrder);
}

const sourceFiles = readSourceFiles();
const mainSource = sourceFiles.find(({ relativePath }) => relativePath === "src/main.js")?.source;

test("HTML renderer inventory freezes six reviewed symbols without line-number allowlists", () => {
  const inventory = assertHtmlArchitecture(sourceFiles);
  assert.equal(inventory.renderers.length, 6);
  assert.equal(inventory.passThroughs.length, 1);
  for (const entry of [...inventory.renderers, ...inventory.passThroughs]) {
    assert.doesNotMatch(entry, /:\d+(?::|$)/u, "architecture manifest must not depend on source line numbers");
  }
});

test("every forbidden HTML renderer API has an add-red-restore-green canary", () => {
  const canaries = [
    ["innerHTML", "function canary(root) { root.innerHTML = '<p>unsafe</p>'; }", "js"],
    ["insertAdjacentHTML", "function canary(root) { root.insertAdjacentHTML('beforeend', '<p>x</p>'); }", "js"],
    ["outerHTML", "function canary(root) { root.outerHTML = '<p>x</p>'; }", "js"],
    [
      "dangerouslySetInnerHTML",
      "function Canary() { return <div dangerouslySetInnerHTML={{ __html: '<p>x</p>' }} />; }",
      "tsx",
    ],
    ["surface html", "function canary() { return mountSheet({ html: '<p>x</p>' }); }", "js"],
    ["DOMParser", "function canary() { return new DOMParser(); }", "js"],
    ["createContextualFragment", "function canary(range) { return range.createContextualFragment('<p>x</p>'); }", "js"],
    ["document.write", "function canary() { document.write('<p>x</p>'); }", "js"],
    ["setHTMLUnsafe", "function canary(root) { root.setHTMLUnsafe('<p>x</p>'); }", "js"],
    [
      "computed access",
      "function canary(root) { root['innerHTML'] = '<p>x</p>'; globalThis.document['write']('<p>x</p>'); return new globalThis.DOMParser(); }",
      "js",
    ],
  ];

  assertHtmlArchitecture(sourceFiles);
  for (const [name, source, extension] of canaries) {
    const injected = [
      ...sourceFiles,
      { relativePath: `src/__canary_${name.replaceAll(" ", "_")}.${extension}`, source },
    ];
    assert.throws(() => assertHtmlArchitecture(injected), { name: "AssertionError" }, `${name} canary stayed green`);
    assertHtmlArchitecture(sourceFiles);
  }
});

test("controller DOM boundary scans non-empty AST input and stays at zero findings", () => {
  const inventory = assertControllerDomBoundary(sourceFiles);
  assert.ok(inventory.files >= 2);
});

test("every controller DOM API has an add-red-restore-green canary", () => {
  assertControllerDomBoundary(sourceFiles);
  for (const api of FRONTEND_ARCHITECTURE_MANIFEST.controllerDomApis) {
    const operator = ["innerHTML", "textContent"].includes(api)
      ? `node.${api} = 'x';`
      : api === "classList"
        ? "node.classList.add('x');"
        : `node.${api}('x');`;
    const injected = [
      ...sourceFiles,
      { relativePath: `src/controller/__canary_${api}.ts`, source: `export function canary(node) { ${operator} }` },
    ];
    assert.throws(() => assertControllerDomBoundary(injected), { name: "AssertionError" }, `${api} stayed green`);
    assertControllerDomBoundary(sourceFiles);
  }
});

test("CSS imports pass, swapping two fails, and restored main source passes", () => {
  assert.equal(typeof mainSource, "string");
  assertCssImportOrder(mainSource);
  const drifted = mainSource
    .replace('import "./style.css"', 'import "./__css_swap__.css"')
    .replace('import "./map-page.css"', 'import "./style.css"')
    .replace('import "./__css_swap__.css"', 'import "./map-page.css"');
  assert.throws(() => assertCssImportOrder(drifted), { name: "AssertionError" });
  assertCssImportOrder(mainSource);
});
