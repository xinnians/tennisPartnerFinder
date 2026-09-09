import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import test from "node:test";

import ts from "typescript";

import { FRONTEND_ARCHITECTURE_MANIFEST } from "./fixtures/frontendArchitectureManifest.js";

const SRC_DIR = new URL("../src/", import.meta.url).pathname;
const PROJECT_ROOT = new URL("../", import.meta.url).pathname;

const DOM_ANY_ASSIGNMENT_PROPERTIES = new Set([
  "alt",
  "async",
  "checked",
  "className",
  "disabled",
  "draggable",
  "hidden",
  "href",
  "id",
  "inert",
  "innerHTML",
  "name",
  "onerror",
  "open",
  "outerHTML",
  "readOnly",
  "required",
  "scrollLeft",
  "scrollTop",
  "selected",
  "selectedIndex",
  "src",
  "tabIndex",
  "textContent",
  "title",
  "type",
  "value",
]);
const DOM_MUTATION_METHODS = new Set([
  "after",
  "append",
  "appendChild",
  "before",
  "insertAdjacentElement",
  "insertAdjacentText",
  "insertBefore",
  "prepend",
  "remove",
  "removeAttribute",
  "removeChild",
  "replaceChildren",
  "replaceWith",
  "setAttribute",
  "toggleAttribute",
]);
const DOM_TOKEN_MUTATION_METHODS = new Set(["add", "remove", "replace", "toggle"]);
const BROWSER_RUNTIME_NAMES = new Set(FRONTEND_ARCHITECTURE_MANIFEST.browserPortScope.runtimeNames);
const BROWSER_PLATFORM_ADAPTER_FILES = new Set(FRONTEND_ARCHITECTURE_MANIFEST.browserPortScope.platformAdapterFiles);
const INJECTED_CONTROLLER_BROWSER_PORT = FRONTEND_ARCHITECTURE_MANIFEST.browserPortScope.injectedControllerPort;

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

function createProjectProgram(extraFiles = {}) {
  const configPath = resolve(PROJECT_ROOT, "tsconfig.json");
  const rawConfig = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(rawConfig.error, undefined, "tsconfig could not be read");
  const config = ts.parseJsonConfigFileContent(rawConfig.config, ts.sys, dirname(configPath));
  const additions = new Map(
    Object.entries(extraFiles).map(([relativePath, source]) => [resolve(PROJECT_ROOT, relativePath), source])
  );
  const host = ts.createCompilerHost(config.options);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => additions.has(fileName) || originalFileExists(fileName);
  host.readFile = (fileName) => additions.get(fileName) ?? originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const injected = additions.get(fileName);
    if (injected !== undefined) {
      return ts.createSourceFile(fileName, injected, languageVersion, true, scriptKind(fileName));
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  return ts.createProgram([...config.fileNames, ...additions.keys()], config.options, host);
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

function assignedProperty(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function controllerUnreadAssignments(sourceFiles) {
  const findings = [];
  for (const candidate of sourceFiles.filter(({ relativePath }) => relativePath.startsWith("src/controller/"))) {
    const parsed = sourceFile(candidate);
    const visit = (node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        assignedProperty(node.left) === "unreadMessageCount"
      ) {
        findings.push(`${candidate.relativePath}::${node.left.getText(parsed)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  }
  return findings.sort();
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

function projectSourcePath(fileName) {
  return relative(PROJECT_ROOT, fileName).replaceAll("\\", "/");
}

function domTargetInfo(checker, domNodeType, expression) {
  const targetType = checker.getNonNullableType(checker.getTypeAtLocation(expression));
  const unresolved = Boolean(targetType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown));
  return {
    isDomNode: !unresolved && checker.isTypeAssignableTo(targetType, domNodeType),
    unresolved,
  };
}

function scanDomMutationLedger(program) {
  const checker = program.getTypeChecker();
  const nodeSymbol = checker.resolveName("Node", undefined, ts.SymbolFlags.Type, false);
  assert.ok(nodeSymbol, "TypeScript DOM Node type is unavailable");
  const domNodeType = checker.getDeclaredTypeOfSymbol(nodeSymbol);
  const grouped = new Map();
  let astNodes = 0;
  let mutationNodes = 0;

  const record = (file, symbol, api, target) => {
    mutationNodes += 1;
    const key = `${file}::${symbol}`;
    const entries = grouped.get(key) ?? new Set();
    entries.add(`${api}::${target}`);
    grouped.set(key, entries);
  };

  for (const parsed of program.getSourceFiles()) {
    const file = projectSourcePath(parsed.fileName);
    if (!file.startsWith("src/")) continue;
    const symbols = [];
    const visit = (node) => {
      astNodes += 1;
      const symbol = nodeName(node, parsed);
      if (symbol) symbols.push(symbol);
      let api = null;
      let target = null;

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
      ) {
        const property = assignedProperty(node.left);
        const receiver = node.left.expression;
        const receiverInfo = domTargetInfo(checker, domNodeType, receiver);
        if (
          property &&
          (receiverInfo.isDomNode || (receiverInfo.unresolved && DOM_ANY_ASSIGNMENT_PROPERTIES.has(property)))
        ) {
          api = property;
          target = receiver.getText(parsed);
        } else if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === "style") {
          const baseInfo = domTargetInfo(checker, domNodeType, receiver.expression);
          if (baseInfo.isDomNode || baseInfo.unresolved) {
            api = `style.${property ?? "[computed]"}`;
            target = receiver.expression.getText(parsed);
          }
        } else if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === "dataset") {
          const baseInfo = domTargetInfo(checker, domNodeType, receiver.expression);
          if (baseInfo.isDomNode || baseInfo.unresolved) {
            api = `dataset.${property ?? "[computed]"}`;
            target = receiver.expression.getText(parsed);
          }
        }
      } else if (
        ts.isCallExpression(node) &&
        (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
      ) {
        const method = assignedProperty(node.expression);
        const receiver = node.expression.expression;
        const receiverInfo = domTargetInfo(checker, domNodeType, receiver);
        if (method && DOM_MUTATION_METHODS.has(method) && (receiverInfo.isDomNode || receiverInfo.unresolved)) {
          api = method;
          target = receiver.getText(parsed);
        } else if (
          method &&
          DOM_TOKEN_MUTATION_METHODS.has(method) &&
          ts.isPropertyAccessExpression(receiver) &&
          receiver.name.text === "classList"
        ) {
          const baseInfo = domTargetInfo(checker, domNodeType, receiver.expression);
          if (baseInfo.isDomNode || baseInfo.unresolved) {
            api = `classList.${method}`;
            target = receiver.expression.getText(parsed);
          }
        } else if (
          method &&
          ["removeProperty", "setProperty"].includes(method) &&
          ts.isPropertyAccessExpression(receiver) &&
          receiver.name.text === "style"
        ) {
          const baseInfo = domTargetInfo(checker, domNodeType, receiver.expression);
          if (baseInfo.isDomNode || baseInfo.unresolved) {
            api = `style.${method}`;
            target = receiver.expression.getText(parsed);
          }
        }
      } else if (ts.isJsxAttribute(node) && propertyName(node.name, parsed) === "dangerouslySetInnerHTML") {
        api = "dangerouslySetInnerHTML";
        target = "jsx";
      } else if (ts.isPropertyAssignment(node) && propertyName(node.name, parsed) === "dangerouslySetInnerHTML") {
        api = "dangerouslySetInnerHTML";
        target = "property";
      }

      if (api && target) record(file, symbols.at(-1) ?? "<top-level>", api, target);
      ts.forEachChild(node, visit);
      if (symbol) symbols.pop();
    };
    visit(parsed);
  }

  return {
    astNodes,
    mutationNodes,
    symbols: [...grouped]
      .map(([key, mutations]) => ({ key, mutations: [...mutations].sort() }))
      .sort(({ key: left }, { key: right }) => left.localeCompare(right)),
  };
}

function assertDomMutationLedger(program) {
  const inventory = scanDomMutationLedger(program);
  assert.ok(inventory.astNodes > 0, "DOM mutation ledger parsed no source AST nodes");
  assert.ok(inventory.mutationNodes > 0, "DOM mutation ledger found no mutation nodes");
  assert.deepEqual(
    inventory.symbols,
    FRONTEND_ARCHITECTURE_MANIFEST.mutationSymbols.map(({ key, mutations }) => ({ key, mutations: [...mutations] }))
  );
  const fileCount = new Set(inventory.symbols.map(({ key }) => key.slice(0, key.indexOf("::")))).size;
  const referenceCount = inventory.symbols.reduce((sum, { mutations }) => sum + mutations.length, 0);
  assert.deepEqual(
    {
      files: fileCount,
      nodes: inventory.mutationNodes,
      references: referenceCount,
      symbols: inventory.symbols.length,
    },
    FRONTEND_ARCHITECTURE_MANIFEST.mutationBaseline
  );
  return inventory;
}

function isDomLibrarySymbol(symbol) {
  return Boolean(
    symbol
      ?.getDeclarations?.()
      ?.some((declaration) =>
        /lib\.(?:dom|dom\.iterable|webworker|webworker\.iterable)\.d\.ts$/u.test(declaration.getSourceFile().fileName)
      )
  );
}

function isTypeOnlyReference(node) {
  let current = node.parent;
  while (current) {
    if (ts.isTypeNode(current) || ts.isInterfaceDeclaration(current) || ts.isTypeAliasDeclaration(current)) {
      return true;
    }
    if (ts.isExpression(current) || ts.isStatement(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

function browserReference(node, checker) {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "globalThis" &&
    isDomLibrarySymbol(checker.getSymbolAtLocation(node.name))
  ) {
    return { form: `globalThis.${node.name.text}`, name: node.name.text };
  }
  if (
    ts.isIdentifier(node) &&
    node.text !== "globalThis" &&
    !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
    !(ts.isQualifiedName(node.parent) && node.parent.right === node) &&
    isDomLibrarySymbol(checker.getSymbolAtLocation(node))
  ) {
    return { form: node.text, name: node.text };
  }
  return null;
}

function groupedBrowserReferences(entries) {
  const grouped = new Map();
  for (const { file, form, symbol } of entries) {
    const key = `${file}::${symbol}`;
    const forms = grouped.get(key) ?? new Set();
    forms.add(form);
    grouped.set(key, forms);
  }
  return [...grouped].map(([key, forms]) => `${key}::${[...forms].sort().join(",")}`).sort();
}

function scanBrowserPorts(program) {
  const checker = program.getTypeChecker();
  const runtime = [];
  const typeOnly = [];
  let astNodes = 0;

  for (const parsed of program.getSourceFiles()) {
    const file = projectSourcePath(parsed.fileName);
    if (!file.startsWith("src/")) continue;
    const symbols = [];
    const visit = (node) => {
      astNodes += 1;
      const symbol = nodeName(node, parsed);
      if (symbol) symbols.push(symbol);
      const reference = browserReference(node, checker);
      if (reference) {
        const entry = { file, form: reference.form, symbol: symbols.at(-1) ?? "<top-level>" };
        if (isTypeOnlyReference(node)) typeOnly.push(entry);
        else if (BROWSER_RUNTIME_NAMES.has(reference.name)) runtime.push(entry);
      }
      ts.forEachChild(node, visit);
      if (symbol) symbols.pop();
    };
    visit(parsed);
  }

  const categories = {
    controllerDirect: [],
    platformAdapters: [],
    typeOnly: groupedBrowserReferences(typeOnly),
    uiGlobals: [],
  };
  for (const entry of groupedBrowserReferences(runtime)) {
    const [file, symbol] = entry.split("::");
    const key = `${file}::${symbol}`;
    if (
      (file.startsWith("src/controller/") || file === "src/sessionController.ts") &&
      key !== INJECTED_CONTROLLER_BROWSER_PORT &&
      !BROWSER_PLATFORM_ADAPTER_FILES.has(file)
    ) {
      categories.controllerDirect.push(entry);
    } else if (BROWSER_PLATFORM_ADAPTER_FILES.has(file) || key === INJECTED_CONTROLLER_BROWSER_PORT) {
      categories.platformAdapters.push(entry);
    } else {
      categories.uiGlobals.push(entry);
    }
  }
  return { astNodes, ...categories };
}

function assertBrowserPortManifest(program) {
  const inventory = scanBrowserPorts(program);
  assert.ok(inventory.astNodes > 0, "browser port scan parsed no source AST nodes");
  for (const category of ["controllerDirect", "platformAdapters", "uiGlobals", "typeOnly"]) {
    assert.ok(inventory[category].length > 0, `${category} browser port scope is unexpectedly empty`);
    assert.deepEqual(inventory[category], FRONTEND_ARCHITECTURE_MANIFEST.browserPorts[category]);
    for (const entry of inventory[category]) {
      assert.doesNotMatch(entry, /:\d+(?::|$)/u, `${entry} depends on a source line number`);
    }
  }
  return inventory;
}

const sourceFiles = readSourceFiles();
const mainSource = sourceFiles.find(({ relativePath }) => relativePath === "src/main.js")?.source;

test("controller code cannot mutate unreadMessageCount in place", () => {
  assert.deepEqual(controllerUnreadAssignments(sourceFiles), []);
  const injected = sourceFiles.map((candidate) =>
    candidate.relativePath === "src/controller/chatController.ts"
      ? { ...candidate, source: `${candidate.source}\ncontext.session.unreadMessageCount = 0;` }
      : candidate
  );
  assert.deepEqual(controllerUnreadAssignments(injected), [
    "src/controller/chatController.ts::context.session.unreadMessageCount",
  ]);
  assert.deepEqual(controllerUnreadAssignments(sourceFiles), []);
});

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

test("the formal DOM mutation ledger has a reviewed owner and lifecycle for every symbol", () => {
  const inventory = assertDomMutationLedger(createProjectProgram());
  assert.equal(inventory.symbols.length, 36);
  for (const entry of FRONTEND_ARCHITECTURE_MANIFEST.mutationSymbols) {
    assert.ok(entry.reference.length > 0, `${entry.key} has no selector or ref source`);
    assert.ok(entry.owner.length > 0, `${entry.key} has no owner`);
    assert.ok(entry.reason.length > 0, `${entry.key} has no retention reason`);
    assert.ok(entry.retirement.length > 0, `${entry.key} has no retirement decision`);
    assert.doesNotMatch(entry.key, /:\d+(?::|$)/u, `${entry.key} depends on a source line number`);
  }
});

test("adding an unreviewed DOM mutation turns the formal ledger red and restoring source turns it green", () => {
  const currentProgram = createProjectProgram();
  assertDomMutationLedger(currentProgram);
  const injectedProgram = createProjectProgram({
    "src/__dom_mutation_ledger_canary.ts":
      "export function mutationCanary(root: any) { root.value = 'unreviewed'; root.style.opacity = '0'; }",
  });
  assert.throws(() => assertDomMutationLedger(injectedProgram), { name: "AssertionError" });
  assertDomMutationLedger(currentProgram);
});

test("the browser port manifest separates controller debt, adapters, UI globals, and type-only references", () => {
  const inventory = assertBrowserPortManifest(createProjectProgram());
  assert.deepEqual(inventory.controllerDirect, [
    "src/controller/intentController.ts::requestCurrentLocation::globalThis.navigator",
  ]);
});

test("adding a direct controller browser global turns the port manifest red and restoring source turns it green", () => {
  const currentProgram = createProjectProgram();
  assertBrowserPortManifest(currentProgram);
  const injectedProgram = createProjectProgram({
    "src/controller/__browser_port_manifest_canary.ts":
      "export function browserPortCanary() { return globalThis.document.visibilityState; }",
  });
  assert.throws(() => assertBrowserPortManifest(injectedProgram), { name: "AssertionError" });
  assertBrowserPortManifest(currentProgram);
});
