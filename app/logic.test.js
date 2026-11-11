const test = require("node:test");
const assert = require("node:assert");
const { cleanRoom, cleanName, countCorrect, calcWpm, calcAccuracy } = require("./logic");

test("cleanRoom lowercases and removes symbols", () => {
  assert.strictEqual(cleanRoom("  My Room!! "), "myroom");
});

test("cleanRoom limits length to 20", () => {
  assert.strictEqual(cleanRoom("a".repeat(50)).length, 20);
});

test("cleanName falls back to Player + id when empty", () => {
  assert.strictEqual(cleanName("", "abcd1234"), "Player abcd");
});

test("countCorrect stops at the first mistake", () => {
  assert.strictEqual(countCorrect("hellx", "hello"), 4);
});

test("countCorrect counts a full match", () => {
  assert.strictEqual(countCorrect("hello", "hello"), 5);
});

test("calcWpm: 50 characters in 1 minute is 10 WPM", () => {
  assert.strictEqual(calcWpm(50, 60000), 10);
});

test("calcAccuracy: 10 mistakes in 100 keys is 90%", () => {
  assert.strictEqual(calcAccuracy(100, 10), 90);
});

test("calcAccuracy: no keys typed is 100%", () => {
  assert.strictEqual(calcAccuracy(0, 0), 100);
});