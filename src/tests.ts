/* eslint-disable no-useless-escape */

import { readFileSync } from "fs";
import { KOLMessage, PublicMessageType } from "./utils/Typings";
import {
  createUpdateMessage,
  formatMessage,
  getPublicMessageType,
  parseUpdates,
  removeKolEmote as removeKolMeEmote,
} from "./utils/Utils";

function formatKolMessage(message: KOLMessage, sender: string) {
  let msg = message.msg;
  const type: PublicMessageType = getPublicMessageType(message);

  if (type === "emote") {
    msg = removeKolMeEmote(sender, msg);
  }

  return formatMessage(sender, msg, type, false, "KoL");
}

// I ultimately end up trying to test stuff anyways
export function runTests() {
  const testsText: string[] = readFileSync(
    "resources/parse_tests.txt",
    "utf-8",
  ).split(/\r?\n\r?/);

  let failed = 0;
  let passed = 0;

  for (let i = 0; i < testsText.length; i += 5) {
    const rawJson = testsText[i + 1];
    const expectedKol = testsText[i + 2].replaceAll("\\n", "\n");
    const expectedDiscord = testsText[i + 3].replaceAll("\\n", "\n");

    try {
      const message: KOLMessage = JSON.parse(rawJson);
      const sender =
        (testsText[i].replace("Sender: ", "") || message.who?.name) ?? "N/A";
      const formatted = formatKolMessage(message, sender);
      const kolMsg = formatted.kolPrefix + formatted.kolMessage;

      if (
        expectedKol === kolMsg &&
        expectedDiscord === formatted.discordMessage
      ) {
        passed++;
        continue;
      }

      failed++;
      console.log("=======================");
      console.log("Test Failed!");
      console.log("Raw: " + rawJson);
      console.log("======");

      if (expectedKol != kolMsg) {
        console.log(`Our parsed output:\t${JSON.stringify(kolMsg)}`);
        console.log(`Expected KoL to be:\t${JSON.stringify(expectedKol)}`);
        console.log("======");
      }

      if (expectedDiscord != formatted.discordMessage) {
        console.log(
          `Our parsed output: \t${JSON.stringify(formatted.discordMessage)}`,
        );
        console.log(`Expected Discord: \t${JSON.stringify(expectedDiscord)}`);
        console.log("======");
      }
    } catch (e) {
      console.log(`Encountered error while trying test ${rawJson}`);
      console.error(e);
    }
  }

  console.log(`Tests Failed: ${failed}`);
  console.log(`Tests Passed: ${passed} / ${failed + passed}`);
}

export function runUpdateTests() {
  const tests: { response: { output: string }; expected: string[] }[] =
    JSON.parse(readFileSync("resources/update_tests.json", "utf-8"));

  let failed = 0;

  for (const test of tests) {
    const parsed = parseUpdates(test.response.output)
      .map(createUpdateMessage)
      .map((m) => formatKolMessage(m, m.who.name).discordMessage);

    if (JSON.stringify(parsed) === JSON.stringify(test.expected)) {
      continue;
    }

    failed++;
    console.log("=======================");
    console.log("Update Test Failed!");
    console.log(`Our parsed output:\t${JSON.stringify(parsed)}`);
    console.log(`Expected:\t${JSON.stringify(test.expected)}`);
  }

  console.log(`Update Tests Failed: ${failed}`);
  console.log(
    `Update Tests Passed: ${tests.length - failed} / ${tests.length}`,
  );
}

runTests();
runUpdateTests();
