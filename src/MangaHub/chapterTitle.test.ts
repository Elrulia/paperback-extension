import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { stripRedundantChapterPrefix } from "./chapterTitle.ts";

const cases: [title: string, chapterNumber: number, expected: string][] = [
  // plain restatements, word-prefixed
  ["Chapter 1", 1, ""],
  ["Ch. 2", 2, ""],
  ["Ch. 4 ", 4, ""],
  ["chapter 16", 16, ""],
  ["Chapter 22.2", 22.2, ""],
  ["Chapter 67.2", 67.2, ""],
  ["", 1, ""],

  // zero-padded restatements
  ["Ch.029", 29, ""],
  ["Ch.007", 7, ""],

  // real titles kept after a word-prefixed restatement
  ["Chapter 1: The Disappearing Girl and Eden", 1, "The Disappearing Girl and Eden"],
  ["Chapter 217: Commentary.", 217, "Commentary."],
  ["Chapter 2: The dolls are alive?!", 2, "The dolls are alive?!"],
  ["Chapter 2 - The title of chapter Part 1", 2, "The title of chapter Part 1"],
  ["Chapter 2 - Chapter Two Begins", 2, "Chapter Two Begins"],

  // scan-group credits and real titles left completely untouched
  ["ASURA SCANS", 54, "ASURA SCANS"],
  ["MANGABLAZE", 8.2, "MANGABLAZE"],
  ["SCANSLATION", 3, "SCANSLATION"],
  ["Miyakata Amane the Dollmaker", 1, "Miyakata Amane the Dollmaker"],
  ["Franchise Business Startup Fraud VI", 64, "Franchise Business Startup Fraud VI"],

  // known noise suffix dropped, with or without a word prefix
  ["7.3-eng-li", 7.3, ""],
  ["5.2-eng-li", 5.2, ""],
  ["6.1-eng-li", 6.1, ""],
  ["ENG-LI", 21, ""],
  ["21-eng-li", 21, ""],

  // dash used as the decimal separator (matches MangaHub's slug convention)
  ["41-5-eng-li", 41.5, ""],
  ["7-3-eng-li", 7.3, ""],
  ["Chapter 22-2", 22.2, ""],

  // bare number alone
  ["5", 5, ""],
  ["21", 21, ""],
  ["5.3", 5.3, ""],

  // bare number + real/unknown text is left untouched — no word prefix means
  // no reliable signal that the leading number is a restatement rather than
  // genuine content
  ["5-Special Edition", 5, "5-Special Edition"],
  ["21-raws", 21, "21-raws"],
  ["5 Days Later", 5, "5 Days Later"],

  // false-positive guards: a leading digit that's part of an unrelated token
  ["20th Century Boys Special", 2, "20th Century Boys Special"],
  ["2024 Anniversary Edition", 2, "2024 Anniversary Edition"],
  ["50 Percent Done", 5, "50 Percent Done"],
  ["2nd Season", 2, "2nd Season"],
  ["3rd Anniversary", 3, "3rd Anniversary"],
  ["21st Night", 21, "21st Night"],
  ["4th Wall Break", 4, "4th Wall Break"],

  // Vol.X marker is always dropped, whether alone or combined with real text
  ["Vol.1 - Chapter 1", 1, ""],
  ["Vol.15 - Chapter 71", 71, ""],
  ["Vol.3 - Chapter 14", 14, ""],
  ["Vol.5 chapter 54", 54, ""],
  ["Vol.12 Ch.122", 122, ""],
  ["Vol.14 - Chapter 148", 148, ""],
  ["Vol.11 Chapter 112: Trial Fraud I", 112, "Trial Fraud I"],
  ["Vol.05 Ch.119 - Life Insurance Fraud (Final Part)", 119, "Life Insurance Fraud (Final Part)"],
  ["Chapter 157: Corporation Con II", 157, "Corporation Con II"],
  // doesn't start with the literal word "vol", so left untouched
  ["Extra Vol 4", 29.5, "Extra Vol 4"],
];

void test("stripRedundantChapterPrefix", async (t: TestContext) => {
  for (const [title, chapterNumber, expected] of cases) {
    await t.test(`${JSON.stringify(title)} (#${chapterNumber})`, () => {
      assert.equal(stripRedundantChapterPrefix(title, chapterNumber), expected);
    });
  }
});
