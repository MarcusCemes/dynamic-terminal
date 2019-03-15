import ansi from "ansi-escapes";
import ansiRegex from "ansi-regex";
import stripAnsi from "strip-ansi";

import { IChange } from "./DynamicTerminalThread";

const ERASE_LINE_END = ansi.eraseEndLine;
const RESET_STYLE = "\x1B[39;49m";

/**
 * A complex algorithm to calculate the required terminal changes necessary
 * to overwrite string A to become string B. Optimized for fast comparison,
 * while intelligently keeping in mind escape codes that are necessary.
 *
 * Designed to work with DynamicTerminal
 *
 */
export class ChangeAlgorithm {
  /** Calculates the required changes to pass from "original" to "target" */
  public static getChanges(
    original: string = "",
    target: string = "",
    line: number = null
  ): IChange[] {
    // Simple tests to avoid expensive calculations
    if (original === target) {
      return [];
    }

    if (original === "") {
      return [{ text: target, index: 0, line }];
    }

    if (target === "") {
      return [{ text: ERASE_LINE_END, index: 0, line }];
    }

    // ANSI Regex that fetches an array of all ANSI codes in a string
    const ar = ansiRegex();

    // Get all ANSI codes in sequential order
    const originalANSICodes: string[] = original.match(ar) || [];
    const targetANSICodes: string[] = target.match(ar) || [];

    // Create a fast storage for accessing ANSI codes for each
    // position of strippedInput and strippedOutput.
    // The arrays contain positions where ANSI codes are present.
    // The objects contain the ANSI codes for each position.
    const originalCodeArray: number[] = [];
    const targetCodeArray: number[] = [];
    const originalCodeMap: { [index: number]: string } = {};
    const targetCodeMap: { [index: number]: string } = {};

    // These will be stripped of ANSI codes
    let strippedOriginal = original;
    let strippedTarget = target;

    // Build the CodeArray and CodeMaps, while stripping the
    // original and target of ANSI codes at the same time.
    originalANSICodes.forEach(code => {
      const position = strippedOriginal.indexOf(code);
      strippedOriginal =
        strippedOriginal.slice(0, position) + strippedOriginal.slice(position + code.length);
      if (originalCodeMap[position]) {
        originalCodeMap[position] += code;
      } else {
        originalCodeMap[position] = code;
      }
      if (originalCodeArray.indexOf(position) === -1) {
        originalCodeArray.push(position);
      }
    });

    targetANSICodes.forEach(code => {
      const position = strippedTarget.indexOf(code);
      strippedTarget =
        strippedTarget.slice(0, position) + strippedTarget.slice(position + code.length);
      if (targetCodeMap[position]) {
        targetCodeMap[position] += code;
      } else {
        targetCodeMap[position] = code;
      }
      if (targetCodeArray.indexOf(position) === -1) {
        targetCodeArray.push(position);
      }
    });

    // This will store the changes that will be returned
    const changes: IChange[] = [];
    // This stores an open change that is being written to. When closed, it's pushed to "changes"
    let changeBuffer: IChange;

    // Compare originalStripped and targetStripped, once letter at a time.
    // Any difference will open a new change, until two identical characters are found.
    // The change will be closed, and the necessary ANSI codes will be prepended and appended.
    // If a modified ANSI code is found in target, a change will be forced with at least one character.
    for (let i = 0; i < strippedTarget.length; i++) {
      // If different letter or different preceding ANSI code is found, a change is needed
      if (strippedTarget[i] !== strippedOriginal[i] || originalCodeMap[i] !== targetCodeMap[i]) {
        if (changeBuffer) {
          // A change is already open, add to it
          if (targetCodeArray.indexOf(i) !== -1) {
            changeBuffer.text += targetCodeMap[i];
          }
          changeBuffer.text += strippedTarget[i];
        } else {
          // A new change needs to be created
          changeBuffer = { text: strippedTarget[i], index: i, line };
          // Prepend the last ANSI code, this is necessary to keep the terminal style
          let codeToPrepend = null;
          for (let k = 0; k <= targetCodeArray.length; k++) {
            const codePosition = targetCodeArray[k];
            if (codePosition > i) {
              break;
            }
            if (codePosition <= i) {
              codeToPrepend = targetCodeMap[codePosition];
            }
          }
          changeBuffer.text = codeToPrepend
            ? codeToPrepend + changeBuffer.text
            : RESET_STYLE + changeBuffer.text;
        }
      } else {
        if (changeBuffer) {
          // If the next character is different, just keep going...
          // Minimizes needless changes for duplicate characters
          if (strippedTarget[i + 1] && strippedTarget[i + 1] !== strippedOriginal[i + 1]) {
            if (targetCodeArray.indexOf(i) !== -1) {
              changeBuffer.text += targetCodeMap[i];
            }
            changeBuffer.text += strippedTarget[i];
          } else {
            // Close the change.
            // Search for the closest closing ANSI and append it,
            // with all of the characters leading up to it.
            for (const codePosition of targetCodeArray) {
              if (codePosition >= i) {
                // Equal, as the current index is not included in the change
                changeBuffer.text +=
                  strippedTarget.substring(i, codePosition) + targetCodeMap[codePosition];
                break;
              }
            }
            // Add the change if it's not useless
            if (stripAnsi(changeBuffer.text).trim() !== "") {
              changes.push(changeBuffer);
            }
            changeBuffer = null;
          }
        }
      }
    }

    // If the end was reached, the change still needs to be closed
    // No ANSI code searching is necessary, just check the last + 1 index
    if (changeBuffer) {
      if (targetCodeArray.indexOf(strippedTarget.length) !== -1) {
        changeBuffer.text += targetCodeMap[strippedTarget.length];
      }
      // Add the change if it's not useless
      if (stripAnsi(changeBuffer.text).trim() !== "") {
        changes.push(changeBuffer);
      }
      changeBuffer = null;
    }

    // If the target is shorter, the rest of the line needs to be erased
    if (strippedTarget.length < strippedOriginal.length) {
      if (changes.length > 0) {
        changes[changes.length - 1].text += ERASE_LINE_END;
      } else {
        changes.push({
          index: strippedTarget.length,
          line,
          text: ERASE_LINE_END
        });
      }
    }

    return changes;
  }
}
