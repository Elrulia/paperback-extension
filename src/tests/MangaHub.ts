import { type TestLogger } from "@paperback/types";

import { MangaHub } from "../MangaHub/main.js";
import sourceInfo from "../MangaHub/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaHub tests", logger);
  registerDefaultTests(suite, MangaHub, sourceInfo);

  await suite.run();
}
