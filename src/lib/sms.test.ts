import test from "node:test";
import assert from "node:assert/strict";
import { smsLink, smsSafe } from "./sms";

test("no & or # survives into the message", () => {
  assert.equal(smsSafe("Tea & Coffee Villa"), "Tea and Coffee Villa");
  assert.equal(smsSafe("Tea&Coffee"), "Tea and Coffee");
  assert.equal(smsSafe("Plot #5 near KFC"), "Plot No. 5 near KFC");
  assert.ok(!/[&#]/.test(smsSafe("a & b # c && d")));
});

test("lines and links are left alone", () => {
  const body = "Directions to Mist Valley:\nGoogle Maps: https://mistvalley.stayidom.in/api/directions\nSee you soon!";
  assert.equal(smsSafe(body), body);
});

test("the sms link decodes back to the cleaned text", () => {
  const link = smsLink("Hello & welcome\nPlot #5");
  assert.ok(link.startsWith("sms:?body="));
  assert.equal(decodeURIComponent(link.slice("sms:?body=".length)), "Hello and welcome\nPlot No. 5");
});
