import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv";

test("text that would run as a spreadsheet formula is neutralised", () => {
  assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
  assert.equal(csvCell("+91 98765 43210"), "'+91 98765 43210");
  assert.ok(csvCell("-cmd|' /C calc'!A0").includes("'-cmd"));
  assert.ok(csvCell("@SUM(A1)").startsWith("'@"));
  assert.ok(csvCell("\t=1+1").replace(/^"/, "").startsWith("'\t"));
});

test("amounts stay numbers: negatives and decimals are not prefixed", () => {
  assert.equal(csvCell(-250), "-250");
  assert.equal(csvCell(1234.5), "1234.5");
  assert.equal(csvCell("-250.00"), "-250.00");
  assert.equal(csvCell("1500.00"), "1500.00");
});

test("ordinary text is untouched; commas, quotes and new lines are quoted", () => {
  assert.equal(csvCell("Ravi Kumar"), "Ravi Kumar");
  assert.equal(csvCell("Nair, Suresh"), '"Nair, Suresh"');
  assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(""), "");
});

test("toCsv builds rows", () => {
  assert.equal(toCsv([["Agent", "Guest"], ["Anil", "=1+1"]]), "Agent,Guest\nAnil,'=1+1");
});
