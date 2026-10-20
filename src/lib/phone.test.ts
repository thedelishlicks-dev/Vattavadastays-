import test from "node:test";
import assert from "node:assert/strict";
import { nationalDigits, formatIndianPhoneInput, isValidIndianMobile, waDigits } from "./phone";

const SAME = "9876543210";

test("every common way of writing one number reads as the same 10 digits", () => {
  for (const raw of ["9876543210", "98765 43210", "+91 98765 43210", "+919876543210", "919876543210", "91 98765 43210", "09876543210", "0 98765 43210", "0091 98765 43210", "+91-98765-43210"]) {
    assert.equal(nationalDigits(raw), SAME, raw);
  }
});

test("pasting a bare number no longer wipes the field (it used to reset to '+91 ')", () => {
  assert.equal(formatIndianPhoneInput("9876543210"), "+91 9876543210");
  assert.equal(formatIndianPhoneInput("+91 98765 43210"), "+91 9876543210");
  assert.equal(formatIndianPhoneInput("09876543210"), "+91 9876543210");
});

test("typing digit by digit works, including numbers that begin 91 and deleting back to the prefix", () => {
  let v = "+91 ";
  for (const ch of "9123456789") { v = formatIndianPhoneInput(v + ch); }
  assert.equal(v, "+91 9123456789");                 // a real mobile starting 91 survives
  assert.equal(formatIndianPhoneInput("+91 9"), "+91 9");
  assert.equal(formatIndianPhoneInput("+91 "), "+91 ");
  assert.equal(formatIndianPhoneInput("+91"), "+91 ");
  assert.equal(formatIndianPhoneInput("+9"), "+91 9");  // a stray partial prefix is not treated as a country code
  assert.equal(formatIndianPhoneInput(""), "+91 ");
  assert.equal(formatIndianPhoneInput("+91 98765432101234"), "+91 9876543210"); // capped at 10
});

test("validation: 10 digits starting 6-9 only", () => {
  assert.equal(isValidIndianMobile("+91 98765 43210"), true);
  assert.equal(isValidIndianMobile("09876543210"), true);
  assert.equal(isValidIndianMobile("+91 "), false);
  assert.equal(isValidIndianMobile("+91 98765"), false);
  assert.equal(isValidIndianMobile("+91 1234567890"), false);  // landline-style start
  assert.equal(isValidIndianMobile(""), false);
});

test("wa.me digits: a leading 0 no longer makes a dead link; +91 is not doubled", () => {
  for (const raw of ["9876543210", "+91 98765 43210", "919876543210", "09876543210", "0091 98765 43210"]) {
    assert.equal(waDigits(raw), "919876543210", raw);
  }
  assert.equal(waDigits("12345"), "12345"); // unreadable input is passed through, not invented
});
