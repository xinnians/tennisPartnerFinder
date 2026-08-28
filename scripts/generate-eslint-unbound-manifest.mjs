#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULE = "@typescript-eslint/unbound-method";
const SCAN_GLOBS = ["src/**/*.{ts,tsx}", "vite.config.ts"];
const JSON_PATH = path.join(ROOT, "docs/arch-eslint-phaseE-unbound-manifest.json");
const MARKDOWN_PATH = path.join(ROOT, "docs/arch-eslint-phaseE-unbound-manifest.md");
const BASELINE_PATH = path.join(ROOT, "docs/arch-eslint-phaseE-baseline.json");
const BASELINE_SHA256 = "14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207";
const REMOVAL_LEDGER_PATH = path.join(ROOT, "docs/arch-eslint-phaseE-removal-ledger.json");
const TYPE_FORMAT_FLAGS = ts.TypeFormatFlags.NoTruncation;
const ALLOWED_MESSAGE_IDS = new Set(["unbound", "unboundWithoutThisAnnotation"]);
const FINDING_FIELDS = [
  "stableId",
  "rule",
  "messageId",
  "path",
  "line",
  "column",
  "astPath",
  "expressionFingerprint",
  "owner",
  "receiverType",
  "declarationPath",
  "declarationKind",
  "thisUsage",
  "transferSink",
  "invocationStyle",
  "identitySensitivity",
  "family",
  "proposedFixClass",
  "tests",
  "reviewStatus",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function readJson(filePath, label) {
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`${label} read failed (${repositoryPath(filePath)}): ${errorMessage(error)}`, { cause: error });
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} JSON parse failed (${repositoryPath(filePath)}): ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} schema violation: expected object`);
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(
      `${label} schema violation: expected keys ${expectedKeys.join(", ")}; received ${actualKeys.join(", ")}`
    );
  }
}

function assertStableId(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{32}$/.test(value)) {
    throw new Error(`${label} schema violation: stableId must be 16-byte lowercase hex`);
  }
}

function assertRepositoryPath(value, label) {
  const segments = typeof value === "string" ? value.split("/") : [];
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} schema violation: path must be a POSIX repository path`);
  }
}

function loadLedgerState() {
  const baselineSource = readFileSync(BASELINE_PATH);
  const baselineChecksum = sha256(baselineSource);
  if (baselineChecksum !== BASELINE_SHA256) {
    throw new Error(`baseline file drifted: expected sha256 ${BASELINE_SHA256}; received ${baselineChecksum}`);
  }
  const baseline = readJson(BASELINE_PATH, "unbound-method baseline");
  assertExactKeys(baseline, ["schemaVersion", "sourceCommit", "findingCount", "findings"], "baseline");
  if (baseline.schemaVersion !== 1) throw new Error(`baseline schema violation: unsupported schemaVersion`);
  if (typeof baseline.sourceCommit !== "string" || !/^[0-9a-f]{7,40}$/.test(baseline.sourceCommit)) {
    throw new Error(`baseline schema violation: sourceCommit must be a git object ID`);
  }
  if (!Number.isInteger(baseline.findingCount) || baseline.findingCount < 0) {
    throw new Error(`baseline schema violation: findingCount must be a non-negative integer`);
  }
  if (!Array.isArray(baseline.findings)) throw new Error(`baseline schema violation: findings must be an array`);
  if (baseline.findingCount !== baseline.findings.length) {
    throw new Error(
      `baseline schema violation: findingCount ${baseline.findingCount} does not match findings ${baseline.findings.length}`
    );
  }

  const baselineById = new Map();
  for (const [index, finding] of baseline.findings.entries()) {
    const label = `baseline.findings[${index}]`;
    assertExactKeys(finding, ["stableId", "path"], label);
    assertStableId(finding.stableId, label);
    assertRepositoryPath(finding.path, label);
    if (baselineById.has(finding.stableId)) {
      throw new Error(`baseline duplicate stableId: ${finding.stableId} (${finding.path})`);
    }
    baselineById.set(finding.stableId, finding);
  }

  const ledger = readJson(REMOVAL_LEDGER_PATH, "unbound-method removal ledger");
  assertExactKeys(ledger, ["schemaVersion", "acceptedRemovals"], "removal ledger");
  if (ledger.schemaVersion !== 1) throw new Error(`removal ledger schema violation: unsupported schemaVersion`);
  if (!Array.isArray(ledger.acceptedRemovals)) {
    throw new Error(`removal ledger schema violation: acceptedRemovals must be an array`);
  }

  const removalIds = new Set();
  for (const [index, removal] of ledger.acceptedRemovals.entries()) {
    const label = `removal ledger.acceptedRemovals[${index}]`;
    assertExactKeys(removal, ["stableId", "path", "batch", "acceptanceDoc"], label);
    assertStableId(removal.stableId, label);
    assertRepositoryPath(removal.path, label);
    assertRepositoryPath(removal.acceptanceDoc, label);
    if (!existsSync(path.join(ROOT, removal.acceptanceDoc))) {
      throw new Error(`${label} acceptanceDoc does not exist: ${removal.acceptanceDoc}`);
    }
    if (typeof removal.batch !== "string" || !removal.batch) {
      throw new Error(`${label} schema violation: batch must be a non-empty string`);
    }
    if (removalIds.has(removal.stableId)) {
      throw new Error(`removal ledger duplicate stableId: ${removal.stableId} (${removal.path})`);
    }
    removalIds.add(removal.stableId);
    const baselineFinding = baselineById.get(removal.stableId);
    if (!baselineFinding) {
      throw new Error(`removal ledger stableId ${removal.stableId} is not in baseline (${removal.path})`);
    }
    if (baselineFinding.path !== removal.path) {
      throw new Error(
        `removal ledger path mismatch for ${removal.stableId}: baseline ${baselineFinding.path}; ledger ${removal.path}`
      );
    }
  }

  return {
    baselineFindings: baseline.findings,
    expectedFindings: baseline.findings.filter((finding) => !removalIds.has(finding.stableId)),
  };
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function repositoryPath(filePath) {
  const relative = toPosix(path.relative(ROOT, path.resolve(filePath)));
  if (!relative.startsWith("../")) return relative;
  const normalized = toPosix(path.resolve(filePath));
  const nodeModulesIndex = normalized.lastIndexOf("/node_modules/");
  return nodeModulesIndex >= 0 ? normalized.slice(nodeModulesIndex + 1) : relative;
}

function normalizedText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function typeText(checker, type, node) {
  return checker.typeToString(type, node, TYPE_FORMAT_FLAGS);
}

function sourceChildren(node) {
  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

function structuralPath(node, sourceFile) {
  const segments = [];
  let current = node;
  while (current) {
    if (current.kind === ts.SyntaxKind.SourceFile) {
      segments.push("SourceFile[0]");
      break;
    }
    const parent = current.parent;
    if (!parent) break;
    const siblings = sourceChildren(parent).filter((candidate) => candidate.kind === current.kind);
    const index = siblings.findIndex(
      (candidate) =>
        candidate === current ||
        (candidate.getStart(sourceFile) === current.getStart(sourceFile) && candidate.getEnd() === current.getEnd())
    );
    if (index < 0) {
      throw new Error(
        `cannot determine structural sibling index for ${repositoryPath(sourceFile.fileName)}:${current.getStart(sourceFile)}`
      );
    }
    segments.push(`${ts.SyntaxKind[current.kind]}[${index}]`);
    current = parent;
  }
  return segments.reverse().join("/");
}

function locateFindingNode(sourceFile, start, end) {
  let best = null;
  function visit(node) {
    const nodeStart = node.getStart(sourceFile);
    const nodeEnd = node.getEnd();
    if (nodeStart > start || nodeEnd < end) return;
    const width = nodeEnd - nodeStart;
    if (!best || width < best.width || (width === best.width && nodeStart === start && best.start !== start)) {
      best = { node, start: nodeStart, width };
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!best) throw new Error(`cannot locate AST node at ${sourceFile.fileName}:${start}-${end}`);
  return best.node;
}

function findAncestor(node, predicate) {
  let current = node;
  while (current) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return null;
}

function relevantExpressionNode(node) {
  const bindingElement = findAncestor(node, ts.isBindingElement);
  if (bindingElement) return bindingElement;
  const propertyAccess = findAncestor(
    node,
    (candidate) => ts.isPropertyAccessExpression(candidate) || ts.isElementAccessExpression(candidate)
  );
  return propertyAccess ?? node;
}

function propertyNameText(bindingElement, sourceFile) {
  const property = bindingElement.propertyName ?? bindingElement.name;
  return normalizedText(property.getText(sourceFile));
}

function expressionFingerprint(node, sourceFile) {
  if (ts.isBindingElement(node)) {
    const sourceName = propertyNameText(node, sourceFile);
    const alias = normalizedText(node.name.getText(sourceFile));
    const initializer = node.initializer ? ` = ${normalizedText(node.initializer.getText(sourceFile))}` : "";
    return `${sourceName === alias ? sourceName : `${sourceName}: ${alias}`}${initializer}`;
  }
  return normalizedText(node.getText(sourceFile));
}

function unwrapAlias(checker, symbol) {
  if (!symbol) return null;
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function emptyObjectLiteral(node) {
  return Boolean(node && ts.isObjectLiteralExpression(node) && node.properties.length === 0);
}

function bindingReceiver(checker, bindingElement) {
  const pattern = bindingElement.parent;
  const container = pattern.parent;
  const propertyName = propertyNameText(bindingElement, bindingElement.getSourceFile());
  let receiverType;
  let receiverTypeValue;

  if (ts.isParameter(container)) {
    receiverTypeValue = checker.getTypeAtLocation(container);
    const formatted = typeText(checker, receiverTypeValue, container);
    receiverType = emptyObjectLiteral(container.initializer)
      ? `default-empty-object:${formatted}`
      : `parameter-pattern:${formatted}`;
  } else if (ts.isVariableDeclaration(container) && container.initializer) {
    receiverTypeValue = checker.getTypeAtLocation(container.initializer);
    receiverType = typeText(checker, receiverTypeValue, container.initializer);
  } else {
    receiverTypeValue = checker.getTypeAtLocation(pattern);
    receiverType = `binding-pattern:${typeText(checker, receiverTypeValue, pattern)}`;
  }

  return {
    receiverType,
    symbol: unwrapAlias(checker, checker.getPropertyOfType(receiverTypeValue, propertyName)),
  };
}

function receiverAndSymbol(checker, node) {
  if (ts.isBindingElement(node)) return bindingReceiver(checker, node);
  if (ts.isPropertyAccessExpression(node)) {
    return {
      receiverType: typeText(checker, checker.getTypeAtLocation(node.expression), node.expression),
      symbol: unwrapAlias(checker, checker.getSymbolAtLocation(node.name)),
    };
  }
  if (ts.isElementAccessExpression(node)) {
    return {
      receiverType: typeText(checker, checker.getTypeAtLocation(node.expression), node.expression),
      symbol: unwrapAlias(checker, checker.getSymbolAtLocation(node.argumentExpression)),
    };
  }
  return {
    receiverType: `no-receiver:${typeText(checker, checker.getTypeAtLocation(node), node)}`,
    symbol: unwrapAlias(checker, checker.getSymbolAtLocation(node)),
  };
}

function functionBody(node) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    return node.body ?? null;
  }
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isFunctionLike(node.initializer)) {
    return node.initializer.body ?? null;
  }
  if (ts.isPropertyAssignment(node) && ts.isFunctionLike(node.initializer)) {
    return node.initializer.body ?? null;
  }
  return null;
}

function symbolForExpression(checker, expression) {
  if (ts.isIdentifier(expression) || ts.isPrivateIdentifier(expression)) {
    return unwrapAlias(checker, checker.getSymbolAtLocation(expression));
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return unwrapAlias(checker, checker.getSymbolAtLocation(expression.name));
  }
  if (ts.isElementAccessExpression(expression)) {
    return unwrapAlias(checker, checker.getSymbolAtLocation(expression.argumentExpression));
  }
  return null;
}

function resolveDeclaration(checker, symbol, seen = new Set()) {
  const nextSymbol = unwrapAlias(checker, symbol);
  if (!nextSymbol || seen.has(nextSymbol)) return null;
  seen.add(nextSymbol);
  const declarations = nextSymbol.getDeclarations() ?? [];

  for (const declaration of declarations) {
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const valueSymbol = checker.getShorthandAssignmentValueSymbol(declaration);
      const resolved = resolveDeclaration(checker, valueSymbol, seen);
      if (resolved) return resolved;
    }
    if (ts.isBindingElement(declaration)) {
      const { symbol: sourceSymbol } = bindingReceiver(checker, declaration);
      const resolved = resolveDeclaration(checker, sourceSymbol, seen);
      if (resolved) return resolved;
    }
    if (ts.isPropertyAssignment(declaration)) {
      if (functionBody(declaration)) return declaration;
      const resolved = resolveDeclaration(checker, symbolForExpression(checker, declaration.initializer), seen);
      if (resolved) return resolved;
    }
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      if (functionBody(declaration)) return declaration;
      const resolved = resolveDeclaration(checker, symbolForExpression(checker, declaration.initializer), seen);
      if (resolved) return resolved;
    }
  }

  const bodyDeclaration = declarations.find((declaration) => functionBody(declaration));
  return bodyDeclaration ?? declarations[0] ?? null;
}

function declarationName(node, sourceFile) {
  if ("name" in node && node.name) return normalizedText(node.name.getText(sourceFile));
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (parent && "name" in parent && parent.name) return normalizedText(parent.name.getText(sourceFile));
  }
  return "<anonymous>";
}

function declarationFingerprint(node) {
  const sourceFile = node.getSourceFile();
  return [
    repositoryPath(sourceFile.fileName),
    ts.SyntaxKind[node.kind],
    declarationName(node, sourceFile),
    structuralPath(node, sourceFile),
  ].join("|");
}

function nestedThisUsage(declaration) {
  const body = functionBody(declaration);
  if (!body) return "ambient-no-body";
  let readsThis = false;

  function visit(node) {
    if (readsThis) return;
    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      readsThis = true;
      return;
    }
    if (
      node !== body &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node))
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(body);
  return readsThis ? "reads-this" : "none";
}

function namedFunctionOwner(node, sourceFile) {
  let current = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      const name = current.name.text;
      if (/^create[A-Z].*(Controller|Api)$/.test(name)) return `factory:${name}`;
      return /^[A-Z]/.test(name) && sourceFile.fileName.endsWith(".tsx") ? `component:${name}` : `function:${name}`;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const declaration = findAncestor(current, ts.isVariableDeclaration);
      if (declaration && ts.isIdentifier(declaration.name)) {
        const name = declaration.name.text;
        return /^[A-Z]/.test(name) && sourceFile.fileName.endsWith(".tsx") ? `component:${name}` : `function:${name}`;
      }
    }
    current = current.parent;
  }
  return `module:${repositoryPath(sourceFile.fileName)}`;
}

function callName(callExpression, sourceFile) {
  return normalizedText(callExpression.expression.getText(sourceFile));
}

function transferDetails(node, sourceFile) {
  if (ts.isBindingElement(node)) {
    const container = node.parent.parent;
    if (ts.isParameter(container)) {
      return {
        identitySensitivity: "none-observed",
        invocationStyle: emptyObjectLiteral(container.initializer) ? "default-callback" : "parameter-destructure",
        transferSink: emptyObjectLiteral(container.initializer) ? "default parameter" : "parameter pattern",
      };
    }
    return {
      identitySensitivity: "none-observed",
      invocationStyle: "destructured-function",
      transferSink: "destructure",
    };
  }

  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isJsxExpression(parent) || ts.isJsxAttribute(parent)) {
      return { identitySensitivity: "react-prop", invocationStyle: "passed-as-callback", transferSink: "prop" };
    }
    if (ts.isCallExpression(parent)) {
      if (parent.expression === current) {
        return { identitySensitivity: "none-observed", invocationStyle: "receiver-call", transferSink: "direct call" };
      }
      if (parent.arguments.includes(current)) {
        const name = callName(parent, sourceFile);
        if (/addEventListener|removeEventListener/.test(name)) {
          return {
            identitySensitivity: "remove-listener",
            invocationStyle: "passed-as-callback",
            transferSink: "listener",
          };
        }
        if (/setTimeout|setInterval/.test(name)) {
          return { identitySensitivity: "timer-handle", invocationStyle: "passed-as-callback", transferSink: "timer" };
        }
        if (/\.(then|catch|finally)$/.test(name)) {
          return {
            identitySensitivity: "promise-chain",
            invocationStyle: "passed-as-callback",
            transferSink: "promise callback",
          };
        }
        return {
          identitySensitivity: "unknown",
          invocationStyle: "passed-as-callback",
          transferSink: "call argument",
        };
      }
    }
    if (ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent)) {
      return {
        identitySensitivity: "unknown",
        invocationStyle: "option-property",
        transferSink: "option bag",
      };
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === current) {
      return {
        identitySensitivity: "none-observed",
        invocationStyle: "extracted-then-called",
        transferSink: "assignment",
      };
    }
    current = parent;
  }
  return { identitySensitivity: "unknown", invocationStyle: "method-reference", transferSink: "unknown" };
}

function factoryNameForBinding(checker, node, sourceFile) {
  if (!ts.isBindingElement(node)) return null;
  const container = node.parent.parent;
  if (!ts.isVariableDeclaration(container) || !container.initializer) return null;

  let initializer = container.initializer;
  if (ts.isIdentifier(initializer)) {
    const symbol = unwrapAlias(checker, checker.getSymbolAtLocation(initializer));
    const sourceDeclaration = (symbol?.getDeclarations() ?? []).find(
      (declaration) => ts.isVariableDeclaration(declaration) && declaration.initializer
    );
    if (sourceDeclaration && ts.isVariableDeclaration(sourceDeclaration) && sourceDeclaration.initializer) {
      initializer = sourceDeclaration.initializer;
    }
  }
  if (!ts.isCallExpression(initializer)) return null;
  return normalizedText(initializer.expression.getText(initializer.getSourceFile() ?? sourceFile));
}

function classifyFamily({ expression, factoryName, path: findingPath, receiverType, transferSink }) {
  if (findingPath === "src/controller/lifecycleActionsController.ts" && expression.includes("api.")) {
    return "api-method-extraction";
  }
  if (findingPath === "src/data/repositories/privateDataRepository.ts" && expression.includes("loadCourts")) {
    return "injected-repository-callback";
  }
  if (expression === "Array.isArray" || receiverType.includes("ArrayConstructor")) {
    return "built-in-static-callback";
  }
  if (receiverType.startsWith("default-empty-object:")) return "callback-default";
  if (findingPath === "src/sessionController.ts" && factoryName) {
    return `controller-factory-result:${factoryName}`;
  }
  if (
    (findingPath === "src/sheets.ts" && expression === "content.unmount") ||
    (findingPath.startsWith("src/sheets/") && /^surfaceContent\.(isSurfaceRootLive|unmount)$/.test(expression))
  ) {
    return "surface-lifecycle";
  }
  if (findingPath.startsWith("src/app/") || findingPath.startsWith("src/sheets/")) {
    return "react-callback-contract";
  }
  if (findingPath.startsWith("src/pages/")) return "context-hook-action";
  if (findingPath.startsWith("src/controller/")) return "controller-callback-port";
  if (transferSink === "listener") return "event-listener";
  if (transferSink === "timer") return "timer-callback";
  if (transferSink === "promise callback") return "promise-callback";
  if (transferSink === "option bag") return "option-bag";
  return factoryName ? "factory-return-destructure" : "method-reference";
}

function proposedFixClass(declaration, thisUsage) {
  if (thisUsage === "reads-this") return "behavior-batch";
  if (thisUsage === "unresolved" || !declaration) return "needs-review";
  const declarationPath = repositoryPath(declaration.getSourceFile().fileName);
  if (declarationPath.startsWith("node_modules/")) return "needs-review";
  if (
    ts.isMethodSignature(declaration) ||
    ts.isPropertySignature(declaration) ||
    ts.isCallSignatureDeclaration(declaration)
  ) {
    return "function-property-contract";
  }
  return thisUsage === "none" ? "this-void-declaration" : "needs-review";
}

function inferredTests(findingPath) {
  if (findingPath.includes("privateDataRepository")) return ["tests/session-data-boundary.test.js"];
  if (findingPath === "src/map.ts") return ["tests/session-controller.test.js"];
  if (findingPath.startsWith("src/controller/") || findingPath === "src/sessionController.ts") {
    return ["tests/session-controller.test.js"];
  }
  if (findingPath === "src/sheets.ts" || findingPath.startsWith("src/sheets/")) {
    return ["tests/sheets-dom.test.js"];
  }
  if (findingPath.includes("MePage")) return ["tests/me-page-dom.test.js"];
  if (findingPath.includes("MySessionsPage")) return ["tests/my-sessions-page-dom.test.js"];
  if (findingPath.includes("NearbySessionsDrawer")) return ["tests/nearby-drawer-dom.test.js"];
  return [];
}

function summarize(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => ({ name, count }));
}

function markdownCell(value, limit = 120) {
  const raw = Array.isArray(value) ? value.join("<br>") : String(value);
  const compact = raw.length > limit ? `${raw.slice(0, Math.max(0, limit - 1))}…` : raw;
  return compact.replace(/\|/g, "\\|").replace(/`/g, "\\`").replace(/\r?\n/g, "<br>");
}

function renderMarkdown(manifest) {
  const lines = [
    "# Phase E unbound-method manifest",
    "",
    "> AUTO-GENERATED by `scripts/generate-eslint-unbound-manifest.mjs`. Do not edit manually.",
    "",
    `- Rule: \`${manifest.rule}\``,
    `- Findings: ${manifest.summary.totalFindings}`,
    `- Files: ${manifest.summary.fileCount}`,
    `- Session controller findings: ${manifest.summary.sessionControllerFindings}`,
    `- Duplicate stable IDs: ${manifest.summary.duplicateStableIdCount}`,
    `- Unresolved declarations: ${manifest.summary.unresolvedDeclarationCount}`,
    `- Unresolved this usage: ${manifest.summary.unresolvedThisUsageCount}`,
    `- Needs review: ${manifest.summary.needsReviewCount}`,
    `- Findings checksum: \`${manifest.findingsChecksum}\``,
    "",
    "## Family statistics",
    "",
    "| Family | Findings | Proposed fix distribution |",
    "| --- | ---: | --- |",
  ];

  for (const family of manifest.familyStatistics) {
    const fixes = family.proposedFixClasses.map(({ name, count }) => `${name}: ${count}`).join(", ");
    lines.push(`| ${markdownCell(family.family)} | ${family.count} | ${markdownCell(fixes)} |`);
  }

  lines.push(
    "",
    "## Navigation",
    "",
    "| Stable ID | Location | Owner | Family | Proposed fix |",
    "| --- | --- | --- | --- | --- |"
  );
  for (const finding of manifest.findings) {
    lines.push(
      `| ${finding.stableId} | ${markdownCell(`${finding.path}:${finding.line}:${finding.column}`)} | ${markdownCell(finding.owner)} | ${markdownCell(finding.family)} | ${markdownCell(finding.proposedFixClass)} |`
    );
  }

  const findingsByPath = new Map();
  for (const finding of manifest.findings) {
    if (!findingsByPath.has(finding.path)) findingsByPath.set(finding.path, []);
    findingsByPath.get(finding.path).push(finding);
  }
  for (const [findingPath, findings] of findingsByPath) {
    lines.push(
      "",
      `## ${findingPath} (${findings.length})`,
      "",
      "| ID | Location | Expression | Receiver type | Declaration | this | Sink / invocation | Identity | Family | Fix | Tests |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const finding of findings) {
      lines.push(
        `| ${finding.stableId} | ${finding.line}:${finding.column} | ${markdownCell(finding.expressionFingerprint)} | ${markdownCell(finding.receiverType)} | ${markdownCell(`${finding.declarationPath} (${finding.declarationKind})`)} | ${finding.thisUsage} | ${markdownCell(`${finding.transferSink} / ${finding.invocationStyle}`)} | ${markdownCell(finding.identitySensitivity)} | ${markdownCell(finding.family)} | ${finding.proposedFixClass} | ${markdownCell(finding.tests)} |`
      );
    }
  }

  const needsReview = manifest.findings.filter(
    (finding) => finding.proposedFixClass === "needs-review" || finding.thisUsage === "unresolved"
  );
  lines.push("", `## Needs review (${needsReview.length})`, "");
  if (needsReview.length === 0) {
    lines.push("None.");
  } else {
    for (const finding of needsReview) {
      lines.push(
        `- ${finding.stableId} — ${finding.path}:${finding.line}:${finding.column} — ${markdownCell(finding.expressionFingerprint, 200)}`
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function validateFindingSchema(findings) {
  for (const finding of findings) {
    for (const field of FINDING_FIELDS) {
      if (!(field in finding) || finding[field] === undefined) {
        throw new Error(`schema violation: ${finding.path ?? "<unknown>"} missing ${field}`);
      }
    }
    if (!Array.isArray(finding.tests)) throw new Error(`schema violation: ${finding.stableId}.tests is not an array`);
    if (!ALLOWED_MESSAGE_IDS.has(finding.messageId)) {
      throw new Error(`schema violation: unexpected messageId ${finding.messageId}`);
    }
  }
}

function normalizedSeverity(ruleConfiguration) {
  const severity = Array.isArray(ruleConfiguration) ? ruleConfiguration[0] : ruleConfiguration;
  if (severity === 2 || severity === "error") return "error";
  if (severity === 1 || severity === "warn") return "warn";
  return "off";
}

async function validateScopedRuleGates(findings, baselineFindings, effectiveConfigEslint) {
  const currentPaths = new Set(findings.map((finding) => finding.path));
  const baselinePaths = [...new Set(baselineFindings.map((finding) => finding.path))].sort((left, right) =>
    left.localeCompare(right)
  );
  const effectiveRules = await Promise.all(
    baselinePaths.map(async (findingPath) => {
      const config = await effectiveConfigEslint.calculateConfigForFile(path.join(ROOT, findingPath));
      return {
        findingPath,
        severity: normalizedSeverity(config?.rules?.[RULE]),
      };
    })
  );
  const errors = [];
  for (const { findingPath, severity } of effectiveRules) {
    if (!currentPaths.has(findingPath) && severity !== "error") {
      errors.push(`cleared file is not scoped to error: ${findingPath} (effective severity: ${severity})`);
    }
    if (currentPaths.has(findingPath) && severity === "error") {
      errors.push(`uncleared file is prematurely scoped to error: ${findingPath} (effective severity: ${severity})`);
    }
  }
  if (errors.length) throw new Error(`scoped unbound-method gate failed:\n- ${errors.join("\n- ")}`);
}

async function validateHardGates(findings, ledgerState, effectiveConfigEslint) {
  const files = new Set(findings.map((finding) => finding.path));
  const stableIds = findings.map((finding) => finding.stableId);
  const duplicateStableIdCount = stableIds.length - new Set(stableIds).size;
  const duplicateStableIds = [...new Set(stableIds.filter((stableId, index) => stableIds.indexOf(stableId) !== index))];
  const unresolvedDeclarationCount = findings.filter(
    (finding) => !finding.declarationPath || !finding.declarationKind
  ).length;
  const sessionControllerFindings = findings.filter((finding) => finding.path === "src/sessionController.ts").length;
  const actualById = new Map(findings.map((finding) => [finding.stableId, finding]));
  const expectedById = new Map(ledgerState.expectedFindings.map((finding) => [finding.stableId, finding]));
  const expectedFileCount = new Set(ledgerState.expectedFindings.map((finding) => finding.path)).size;
  const expectedSessionControllerFindings = ledgerState.expectedFindings.filter(
    (finding) => finding.path === "src/sessionController.ts"
  ).length;
  const errors = [];
  for (const finding of findings) {
    const expected = expectedById.get(finding.stableId);
    if (!expected) {
      errors.push(`unexpected current finding outside baseline-minus-ledger: ${finding.stableId} (${finding.path})`);
    } else if (expected.path !== finding.path) {
      errors.push(
        `current finding path mismatch for ${finding.stableId}: expected ${expected.path}; received ${finding.path}`
      );
    }
  }
  for (const expected of ledgerState.expectedFindings) {
    if (!actualById.has(expected.stableId)) {
      errors.push(`expected finding missing from current scan: ${expected.stableId} (${expected.path})`);
    }
  }
  if (findings.length !== ledgerState.expectedFindings.length) {
    errors.push(`findings expected ${ledgerState.expectedFindings.length}, received ${findings.length}`);
  }
  if (files.size !== expectedFileCount) errors.push(`files expected ${expectedFileCount}, received ${files.size}`);
  if (duplicateStableIdCount !== 0) {
    const duplicateLocations = duplicateStableIds.flatMap((stableId) =>
      findings
        .filter((finding) => finding.stableId === stableId)
        .map((finding) => `${stableId}=${finding.path}:${finding.line}:${finding.column}`)
    );
    errors.push(`duplicate stable IDs: ${duplicateStableIdCount} (${duplicateLocations.join(", ")})`);
  }
  if (unresolvedDeclarationCount !== 0) {
    errors.push(`unresolved declarations: ${unresolvedDeclarationCount}`);
  }
  if (sessionControllerFindings !== expectedSessionControllerFindings) {
    errors.push(
      `sessionController findings expected ${expectedSessionControllerFindings}, received ${sessionControllerFindings}`
    );
  }
  if (errors.length) throw new Error(`manifest hard gate failed:\n- ${errors.join("\n- ")}`);
  await validateScopedRuleGates(findings, ledgerState.baselineFindings, effectiveConfigEslint);
  return { duplicateStableIdCount, fileCount: files.size, sessionControllerFindings, unresolvedDeclarationCount };
}

async function buildManifest() {
  const ledgerState = loadLedgerState();
  const configPath = path.join(ROOT, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT, undefined, configPath);
  const program = ts.createProgram({ options: parsedConfig.options, rootNames: parsedConfig.fileNames });
  const checker = program.getTypeChecker();
  const scanEslint = new ESLint({
    overrideConfig: [{ files: SCAN_GLOBS, rules: { [RULE]: "error" } }],
  });
  const effectiveConfigEslint = new ESLint();
  const lintResults = await scanEslint.lintFiles(SCAN_GLOBS);
  const lintFindings = lintResults.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === RULE)
      .map((message) => ({ filePath: result.filePath, message }))
  );
  const findings = [];

  for (const { filePath, message } of lintFindings) {
    const findingPath = repositoryPath(filePath);
    const sourceFile = program.getSourceFile(path.resolve(filePath));
    if (!sourceFile) throw new Error(`TypeScript Program omitted ${findingPath}`);
    const start = sourceFile.getPositionOfLineAndCharacter(message.line - 1, message.column - 1);
    const end = sourceFile.getPositionOfLineAndCharacter(
      (message.endLine ?? message.line) - 1,
      (message.endColumn ?? message.column + 1) - 1
    );
    const locatedNode = locateFindingNode(sourceFile, start, end);
    const expressionNode = relevantExpressionNode(locatedNode);
    const astPath = structuralPath(expressionNode, sourceFile);
    const expression = expressionFingerprint(expressionNode, sourceFile);
    const receiver = receiverAndSymbol(checker, expressionNode);
    const declaration = resolveDeclaration(checker, receiver.symbol);
    const declarationPath = declaration ? repositoryPath(declaration.getSourceFile().fileName) : "";
    const declarationKind = declaration ? ts.SyntaxKind[declaration.kind] : "";
    const thisUsage = declaration ? nestedThisUsage(declaration) : "unresolved";
    const transfer = transferDetails(expressionNode, sourceFile);
    const factoryName = factoryNameForBinding(checker, expressionNode, sourceFile);
    const family = classifyFamily({
      expression,
      factoryName,
      path: findingPath,
      receiverType: receiver.receiverType,
      transferSink: transfer.transferSink,
    });
    const declarationIdentity = declaration ? declarationFingerprint(declaration) : "<unresolved>";
    const stableId = sha256([RULE, findingPath, astPath, expression, declarationIdentity].join("\0")).slice(0, 32);

    findings.push({
      stableId,
      rule: RULE,
      messageId: message.messageId ?? "",
      path: findingPath,
      line: message.line,
      column: message.column,
      astPath,
      expressionFingerprint: expression,
      owner: namedFunctionOwner(expressionNode, sourceFile),
      receiverType: receiver.receiverType,
      declarationPath,
      declarationKind,
      thisUsage,
      transferSink: transfer.transferSink,
      invocationStyle: transfer.invocationStyle,
      identitySensitivity: transfer.identitySensitivity,
      family,
      proposedFixClass: proposedFixClass(declaration, thisUsage),
      tests: inferredTests(findingPath),
      reviewStatus: "machine-classified",
    });
  }

  findings.sort((left, right) => left.path.localeCompare(right.path) || left.astPath.localeCompare(right.astPath));
  validateFindingSchema(findings);
  const gates = await validateHardGates(findings, ledgerState, effectiveConfigEslint);
  const familyNames = [...new Set(findings.map((finding) => finding.family))].sort((left, right) =>
    left.localeCompare(right)
  );
  const familyStatistics = familyNames.map((family) => {
    const familyFindings = findings.filter((finding) => finding.family === family);
    return {
      family,
      count: familyFindings.length,
      proposedFixClasses: summarize(familyFindings.map((finding) => finding.proposedFixClass)),
    };
  });
  const manifest = {
    schemaVersion: 1,
    rule: RULE,
    scanGlobs: SCAN_GLOBS,
    findingsChecksum: `sha256:${sha256(JSON.stringify(findings))}`,
    summary: {
      totalFindings: findings.length,
      fileCount: gates.fileCount,
      sessionControllerFindings: gates.sessionControllerFindings,
      duplicateStableIdCount: gates.duplicateStableIdCount,
      unresolvedDeclarationCount: gates.unresolvedDeclarationCount,
      unresolvedThisUsageCount: findings.filter((finding) => finding.thisUsage === "unresolved").length,
      needsReviewCount: findings.filter((finding) => finding.proposedFixClass === "needs-review").length,
    },
    messageIdStatistics: summarize(findings.map((finding) => finding.messageId)),
    thisUsageStatistics: summarize(findings.map((finding) => finding.thisUsage)),
    proposedFixClassStatistics: summarize(findings.map((finding) => finding.proposedFixClass)),
    familyStatistics,
    findings,
  };
  return {
    json: `${JSON.stringify(manifest, null, 2)}\n`,
    manifest,
    markdown: renderMarkdown(manifest),
  };
}

function assertOnlyFlag(argumentsList) {
  if (argumentsList.length === 0) return false;
  if (argumentsList.length === 1 && argumentsList[0] === "--check") return true;
  console.error("usage: node scripts/generate-eslint-unbound-manifest.mjs [--check]");
  process.exit(1);
}

function verifyGeneratedFiles(contents) {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "tennis-eslint-unbound-"));
  try {
    const temporaryJson = path.join(temporaryDirectory, path.basename(JSON_PATH));
    const temporaryMarkdown = path.join(temporaryDirectory, path.basename(MARKDOWN_PATH));
    writeFileSync(temporaryJson, contents.json, "utf8");
    writeFileSync(temporaryMarkdown, contents.markdown, "utf8");
    const drift = [];
    for (const [expectedPath, temporaryPath] of [
      [JSON_PATH, temporaryJson],
      [MARKDOWN_PATH, temporaryMarkdown],
    ]) {
      let expected;
      try {
        expected = readFileSync(expectedPath, "utf8");
      } catch {
        drift.push(`${repositoryPath(expectedPath)} is missing`);
        continue;
      }
      if (expected !== readFileSync(temporaryPath, "utf8")) {
        drift.push(`${repositoryPath(expectedPath)} has drifted`);
      }
    }
    if (drift.length) {
      console.error(`eslint unbound manifest check failed:\n- ${drift.join("\n- ")}`);
      process.exit(1);
    }
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

const check = assertOnlyFlag(process.argv.slice(2));
const contents = await buildManifest();
if (check) {
  verifyGeneratedFiles(contents);
} else {
  writeFileSync(JSON_PATH, contents.json, "utf8");
  writeFileSync(MARKDOWN_PATH, contents.markdown, "utf8");
}
console.log(
  `eslint unbound manifest ${check ? "check passed" : "generated"}: ${contents.manifest.summary.totalFindings} findings/${contents.manifest.summary.fileCount} files; sessionController ${contents.manifest.summary.sessionControllerFindings}; duplicates ${contents.manifest.summary.duplicateStableIdCount}; unresolved declarations ${contents.manifest.summary.unresolvedDeclarationCount}; ${contents.manifest.findingsChecksum}`
);
