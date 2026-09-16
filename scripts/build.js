#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const MarkdownIt = require("markdown-it");

const repositoryRoot = path.resolve(__dirname, "..");
const popupTextPath = path.join(repositoryRoot, "popup-text.md");
const indexPath = path.join(repositoryRoot, "index.html");
const startMarker = "    // BEGIN GENERATED POPUP TEXT";
const endMarker = "    // END GENERATED POPUP TEXT";
const requiredKeys = [
  "gross",
  "net",
  "ucb",
  "fiscal",
  "grossChange",
  "grossGrowth",
  "netChange",
  "agsInterest",
  "interest",
  "government"
];

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: false,
  typographer: false,
  validateLink: () => true
}).disable([
  "blockquote",
  "code",
  "fence",
  "heading",
  "hr",
  "image",
  "lheading",
  "list",
  "table"
]);

function isSafeLink(href) {
  try {
    const url = new URL(href, "https://example.invalid/");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parsePopupSections(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const sections = new Map();
  let activeKey = null;
  let activeStartLine = 0;
  let buffer = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const opening = line.match(/^\[([A-Za-z][A-Za-z0-9_-]*)\]\s*$/);
    const closing = line.match(/^\[\/([A-Za-z][A-Za-z0-9_-]*)\]\s*$/);

    if (opening) {
      if (activeKey) {
        throw new Error(`Nested section [${opening[1]}] at line ${lineNumber}; close [${activeKey}] first.`);
      }
      if (sections.has(opening[1])) {
        throw new Error(`Duplicate popup section [${opening[1]}] at line ${lineNumber}.`);
      }
      activeKey = opening[1];
      activeStartLine = lineNumber;
      buffer = [];
      return;
    }

    if (closing) {
      if (!activeKey) {
        throw new Error(`Unexpected closing section [/${closing[1]}] at line ${lineNumber}.`);
      }
      if (closing[1] !== activeKey) {
        throw new Error(`Section [${activeKey}] opened at line ${activeStartLine} closes as [/${closing[1]}] at line ${lineNumber}.`);
      }
      const value = buffer.join("\n").trim();
      if (!value) {
        throw new Error(`Popup section [${activeKey}] at line ${activeStartLine} is empty.`);
      }
      sections.set(activeKey, value);
      activeKey = null;
      activeStartLine = 0;
      buffer = [];
      return;
    }

    if (activeKey) {
      buffer.push(line);
      return;
    }

    if (line.trim() === "" || line.trim().startsWith("#")) return;
    throw new Error(`Unexpected content outside a popup section at line ${lineNumber}.`);
  });

  if (activeKey) {
    throw new Error(`Popup section [${activeKey}] opened at line ${activeStartLine} is not closed.`);
  }

  const requiredSet = new Set(requiredKeys);
  for (const key of sections.keys()) {
    if (!requiredSet.has(key)) {
      throw new Error(`Unknown popup section [${key}]. Expected: ${requiredKeys.join(", ")}.`);
    }
  }
  for (const key of requiredKeys) {
    if (!sections.has(key)) {
      throw new Error(`Missing required popup section [${key}].`);
    }
  }

  return sections;
}

function collectPlainText(tokens) {
  let text = "";

  const appendInline = (children) => {
    for (const token of children || []) {
      switch (token.type) {
        case "text":
        case "code_inline":
          text += token.content;
          break;
        case "softbreak":
        case "hardbreak":
          text += "\n";
          break;
        case "link_open":
        case "link_close":
        case "em_open":
        case "em_close":
        case "strong_open":
        case "strong_close":
          break;
        default:
          throw new Error(`Unsupported inline Markdown token: ${token.type}.`);
      }
    }
  };

  for (const token of tokens) {
    switch (token.type) {
      case "paragraph_open":
        break;
      case "inline":
        appendInline(token.children);
        break;
      case "paragraph_close":
        text += "\n\n";
        break;
      default:
        throw new Error(`Unsupported block Markdown token: ${token.type}.`);
    }
  }

  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function addSafeLinkAttributes(tokens, key) {
  tokens.forEach((token) => {
    if (token.type !== "inline") return;
    for (const child of token.children || []) {
      if (child.type !== "link_open") continue;
      const href = child.attrGet("href");
      if (!href || !isSafeLink(href)) {
        throw new Error(`Popup section [${key}] contains an unsafe or invalid link.`);
      }
      child.attrSet("target", "_blank");
      child.attrSet("rel", "noopener noreferrer");
    }
  });
}

function validateMarkdownLinkDestinations(source, key) {
  const linkPattern = /\]\(\s*<?([^>\s)]+)>?/g;
  let match;
  while ((match = linkPattern.exec(source)) !== null) {
    if (!isSafeLink(match[1])) {
      throw new Error(`Popup section [${key}] contains an unsafe or invalid link.`);
    }
  }
}

function renderPopupSection(source, key) {
  validateMarkdownLinkDestinations(source, key);
  const tokens = markdown.parse(source, {});
  addSafeLinkAttributes(tokens, key);
  const html = markdown.renderer.render(tokens, markdown.options, {}).trim();
  const text = collectPlainText(tokens);
  if (!html || !text) {
    throw new Error(`Popup section [${key}] did not produce usable content.`);
  }
  return { html, text };
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function generatePopupBlock(sections) {
  const lines = [
    "    // BEGIN GENERATED POPUP TEXT. Edit popup-text.md and run npm run build.",
    "    const measureExplanations = {"
  ];

  requiredKeys.forEach((key, index) => {
    const explanation = renderPopupSection(sections.get(key), key);
    const comma = index === requiredKeys.length - 1 ? "" : ",";
    lines.push(`      ${key}: {`);
    lines.push(`        html: ${safeJson(explanation.html)},`);
    lines.push(`        text: ${safeJson(explanation.text)}`);
    lines.push(`      }${comma}`);
  });

  lines.push("    };");
  lines.push("    // END GENERATED POPUP TEXT");
  return lines.join("\n");
}

function replaceGeneratedBlock(indexSource, generatedBlock) {
  const start = indexSource.indexOf(startMarker);
  const end = indexSource.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find the generated popup-text markers in index.html.");
  }
  if (indexSource.indexOf(startMarker, start + startMarker.length) !== -1) {
    throw new Error("index.html contains more than one generated popup-text start marker.");
  }
  if (indexSource.indexOf(endMarker, end + endMarker.length) !== -1) {
    throw new Error("index.html contains more than one generated popup-text end marker.");
  }
  return `${indexSource.slice(0, start)}${generatedBlock}${indexSource.slice(end + endMarker.length)}`;
}

function build() {
  const popupSource = fs.readFileSync(popupTextPath, "utf8");
  const indexSource = fs.readFileSync(indexPath, "utf8");
  const sections = parsePopupSections(popupSource);
  const generatedBlock = generatePopupBlock(sections);
  const updatedIndex = replaceGeneratedBlock(indexSource, generatedBlock);

  if (updatedIndex !== indexSource) {
    fs.writeFileSync(indexPath, updatedIndex);
    console.log("Built index.html from popup-text.md.");
  } else {
    console.log("index.html is already up to date.");
  }
}

if (require.main === module) {
  try {
    build();
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  build,
  collectPlainText,
  generatePopupBlock,
  parsePopupSections,
  renderPopupSection,
  replaceGeneratedBlock
};
