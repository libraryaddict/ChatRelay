/* eslint-disable no-useless-escape */

import { readFileSync } from "fs";
import { KOLMessage, PublicMessageType } from "./utils/Typings";
import {
  formatMessage,
  getPublicMessageType,
  removeKolEmote as removeKolMeEmote
} from "./utils/Utils";

// I ultimately end up trying to test stuff anyways
export function runTests() {
  const testsText: string[] = readFileSync(
    "resources/parse_tests.txt",
    "utf-8"
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
      let msg = message.msg;
      const type: PublicMessageType = getPublicMessageType(message);

      if (type === "emote") {
        msg = removeKolMeEmote(sender, msg);
      }

      const formatted = formatMessage(sender, msg, type, false, "KoL");
      const kolMsg = formatted.kolPrefix + " " + formatted.kolMessage;

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
        console.log(`Expected KoL: ${expectedKol}`);
        console.log(`Received: ${kolMsg}`);
        console.log("======");
      }

      if (expectedDiscord != formatted.discordMessage) {
        console.log(`Expected Discord: ${expectedDiscord}`);
        console.log(`Received: ${formatted.discordMessage}`);
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

runTests();
