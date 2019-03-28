import ansi from "ansi-escapes";
import chalk from "chalk";
import _debug from "debug";
import elegantSpinner from "elegant-spinner";
import exitHook from "exit-hook";
import figures from "figures";
import indentString from "indent-string";
import os from "os";
import stripAnsi from "strip-ansi";
import _windowSize from "window-size";
import wrapAnsi from "wrap-ansi";

import { ChangeAlgorithm } from "./ChangeAlgorithm";

const defaultDebug = _debug("DTTCommand");
const renderDebug = _debug("DTTRender");

// Can return undefined if it can't be detected
const windowSize = _windowSize
  ? _windowSize
  : { width: 80, height: 30, get: () => ({ width: 80, height: 30 }) };

/**
 * A single line of terminal output.
 */
export interface ILine {
  /** The line contents. If it contains "\n", it will be split into several Line objects */
  text?: string;
  /** The indentation to apply to the terminal output */
  indent?: number;
  /** Force re-rendering of the entire line */
  force?: boolean;
}

export interface IChange {
  line: number;
  index: number;
  text: string;
}

export interface IOptions {
  disableInput?: boolean;
  hideCursor?: boolean;

  /**
   * Used to set the colour for the spinner. Receives the spinner as a string,
   * and expects a ANSI colour code wrapped string.
   */
  spinnerColour?: (text: string) => string;

  /** Milliseconds between each spinner re-render. Modifies the speed of the spinner */
  updateFrequency?: number;

  /** Clear and repaint everything if resize is detected */
  repaintOnResize?: boolean;
}

const DEFAULT_OPTIONS = {
  disableInput: false,
  hideCursor: true,
  repaintOnResize: false,
  updateFrequency: 100
};

export const SPINNER = "_*_";
export const TICK = figures.tick;
export const CROSS = figures.cross;

/**
 * The thread that handles terminal updates. This should not be directly used,
 * instead use the DynamicTerminal class.
 */
class DynamicTerminalThread {
  private active: boolean = false;
  private wasRaw: boolean = null; // Used to restore input after being disabled
  private cursorHidden: boolean = false;

  private previousSpinner: string = ""; // Previous spinner status for re-rendering
  private spinner: () => string = elegantSpinner();
  private nextSpinner: string;
  private updateFrequency: number = 100;
  private spinnerColor: (text: string) => string = chalk.cyan;

  private repaintOnResize: boolean = false; // Repaint everything on resize
  private previousSize = windowSize.get();
  private previousRender: ILine[] = [];
  private nextRender: ILine[] = [];
  private renderInterval: NodeJS.Timeout | false = false; // The interval reference

  private cursorLine: number; // The current line position of the cursor
  private cursorIndex: number; // The current index position of the cursor

  constructor() {
    this.nextSpinner = this.spinner();

    // Set a higher priority to keep up with updates
    try {
      os.setPriority(os.constants.priority.PRIORITY_HIGH);
    } catch (err) {
      /* */
    }

    exitHook(() => {
      this.stop();
      defaultDebug("EXITHOOK", "Cleanup complete");
    });
    this.debug(chalk.cyan("NEW"), "Worker has started");
  }

  /**
   * Starts a new write session to the terminal. Anything may be replaced during the session.
   */
  public start(options: IOptions = {}) {
    if (!this.active) {
      this.active = true;
      this.debug(chalk.green("START"), "New terminal session");
      options = {
        ...DEFAULT_OPTIONS,
        ...options
      };
      this.wasRaw = process.stdin.isRaw;
      if (options.disableInput) {
        process.stdin.setRawMode(true);
      }

      if (options.hideCursor) {
        this.cursorHidden = true;
        this.write(ansi.cursorHide);
      }

      if (options.spinnerColour) {
        this.spinnerColor = options.spinnerColour;
      }

      if (options.updateFrequency) {
        this.updateFrequency = options.updateFrequency;
      }

      if (options.repaintOnResize) {
        this.repaintOnResize = options.repaintOnResize;
      }

      this.previousRender = [];
      this.nextRender = [];

      // Reset the cursor position
      this.write("\r" + ansi.eraseEndLine);
      this.cursorLine = 0;
      this.cursorIndex = 0;

      this.startTimer();
    }
  }

  /**
   * Terminates the running session
   * @param commit Whether already printed text should persist
   */
  public stop(commit: boolean = true) {
    if (this.active) {
      this.active = false;
      this.debug(chalk.red("STOP"), "Ending terminal session");
      this.stopTimer();
      if (commit) {
        this.render(); // Give it a last render
        this.moveCursorTo(this.previousRender.length, 0);
      } else {
        this.nextRender = [];
        this.moveCursorTo(0, 0);
        process.stdout.write(ansi.eraseDown);
      }

      if (this.wasRaw !== null) {
        process.stdin.setRawMode(this.wasRaw);
      }
      this.wasRaw = null;

      if (this.cursorHidden) {
        this.write(ansi.cursorShow);
      }
      this.cursorHidden = false;

      this.previousRender = [];
      this.nextRender = [];
      this.debug(chalk.red("STOP"), "Cleanup complete");
    }
  }

  /**
   * Returns the next render queue as an array of Line objects
   */
  public getLines(): ILine[] {
    return this.nextRender;
  }

  /**
   * Forces a complete re-render on next render
   */
  public resetRender() {
    this.previousRender = [];
  }

  /**
   * Updates the entire render buffer with the contents.
   *
   * @param {string | ILine | string[] | ILine[]} text May be a string with new lines,
   * an array of strings, or an array of objects. Objects are easy to pass
   * to sub-tasks for update by reference, and allow easy indenting.
   */
  public update(text: string | ILine | string[] | ILine[]) {
    this.nextRender = this.processTextToLineObjects(text);
    this.debug(
      chalk.keyword("orange")("UPDATE"),
      "Replaced with " + this.nextRender.length + " lines"
    );
    this.startTimer();
    this.render();
  }

  /**
   * Appends to the current session
   *
   * @param {string | ILine | string[] | ILine[]} text May be a string with new lines,
   * an array of strings, or an array of objects. Objects are easy to pass
   * to sub-tasks for update by reference, and allow easy indenting.
   */
  public append(text: string | ILine | string[] | ILine[]) {
    this.nextRender = this.nextRender.concat(this.processTextToLineObjects(text));
    this.debug(chalk.keyword("orange")("APPEND"), "Added to render queue");
    this.startTimer();
    this.render();
  }

  /**
   * Updates the screen to match nextRender.
   * Re-renders both the previous and current screen
   * status based on the terminal width, and consolidates
   * changes.
   *
   * Out-of-date portions of the screen will be overwritten.
   * Should not need to be called directly.
   */
  public render(): void {
    if (!this.active) {
      return;
    }

    // 1. Renders the previous and next screen status, based on the current terminal width
    // 2. Calculates the changes necessary to pass from one to the other
    // 3. Writes the changes to terminal by moving cursor to selected positions
    // 4. Cleans up, moving cursor to known position, save state and useful info for next render

    const size: { width: number; height: number } = windowSize.get();
    let previousLines: string[] = [];
    let nextLines: Array<{ text: string; force?: boolean }> = [];

    // Render both screen status. This will return arrays of strings and lines
    // Lines will be split based on the terminal size and indented correctly.
    // Each line in previousLines and nextLines is a trimmed line WITHOUT wrapping
    this.previousRender.forEach(line => {
      previousLines = previousLines.concat(
        indentString(
          wrapAnsi(
            line.text.replace(SPINNER, this.spinnerColor(this.previousSpinner)),
            size.width,
            {
              hard: true,
              trim: false
            }
          ),
          line.indent || 0
        ).split("\n")
      );
    });
    this.nextRender.forEach(line => {
      nextLines = nextLines.concat(
        indentString(
          wrapAnsi(line.text.replace(SPINNER, this.spinnerColor(this.nextSpinner)), size.width, {
            hard: true,
            trim: false
          }),
          line.indent || 0
        )
          .split("\n")
          .map(splitLine => ({
            force: line.force === true ? true : false,
            text: splitLine
          }))
      );
    });

    // Update the stored cursor position if the terminal was resized since last render
    this.cursorLine = Math.max(0, previousLines.length - 1);
    this.cursorIndex = (previousLines[previousLines.length - 1] || "").length;

    // Check if a full repaint needs to happen
    if (this.repaintOnResize && this.previousSize.width !== size.width) {
      previousLines = [];
      this.moveCursorTo(0, 0);
      process.stdout.write(ansi.eraseDown);
      this.previousSize = size;
    }

    // The previous spinner state is no longer needed, update it for the next render
    this.previousSpinner = this.nextSpinner;

    // Create an array of all the necessary changes that need to be applied to update the terminal
    let changes: IChange[] = [];

    for (let lineNumber = 0; lineNumber < nextLines.length; lineNumber++) {
      const previousLine = previousLines[lineNumber];
      const nextLine = nextLines[lineNumber];

      // Execute the change algorithm, or re-render the entire line if "force"
      const lineChanges =
        nextLine.force === true
          ? [
              {
                index: 0,
                line: lineNumber,
                text: nextLine.text + ansi.eraseEndLine
              }
            ]
          : ChangeAlgorithm.getChanges(previousLine, nextLine.text, lineNumber);
      changes = changes.concat(lineChanges);
    }

    // Erase the rest of the screen if there are trailing lines
    if (previousLines.length > nextLines.length) {
      if (changes.length > 0) {
        changes[changes.length - 1].text += ansi.eraseDown;
      } else {
        changes.push({
          index: 0,
          line: 0,
          text: ansi.eraseDown
        });
      }
    }

    // Iterate over each change and overwrite the console
    if (changes.length > 0) {
      for (const change of changes) {
        this.moveCursorTo(change.line, change.index);
        this.write(change.text);
        this.cursorIndex += stripAnsi(change.text).length;
      }
    }

    // Move the cursor to the very end (known position) to compensate for terminal resizing
    this.moveCursorTo(
      Math.max(0, nextLines.length - 1),
      (nextLines[nextLines.length - 1] || { text: "" }).text.length
    );

    // Store the current render *with current line wrapping applied*
    this.previousRender = nextLines.map(line => ({
      indent: 0,
      text: line.text
    }));

    if (renderDebug.enabled) {
      renderDebug(chalk.bold.cyan("  -- Render summary --"));
      renderDebug(chalk.bold("Previous lines:"));
      renderDebug(previousLines);
      renderDebug(chalk.bold("Next lines:"));
      renderDebug(nextLines);
      renderDebug(chalk.bold("Changes:"));
      renderDebug(changes);
    }
  }

  /**
   * Converts the input intelligently into an array of Line objects
   */
  private processTextToLineObjects(text: string | ILine | string[] | ILine[]): ILine[] {
    // Cast to array if it's a single line
    if (typeof text === "object" && !Array.isArray(text)) {
      text = [text];
    }

    // Deconstruct each line, creating Line objects
    let lineArray = [];
    if (Array.isArray(text)) {
      // Construct a new array
      for (const element of text) {
        if (typeof element === "string") {
          lineArray = lineArray.concat(this.splitStringToLineObjects(element));
        } else if (typeof element === "object" && typeof element.text === "string") {
          lineArray = lineArray.concat(
            this.splitStringToLineObjects(element.text, element.indent || 0, element.force || false)
          );
        }
      }
    } else if (typeof text === "string") {
      lineArray = this.splitStringToLineObjects(text);
    }

    return lineArray;
  }

  /**
   * Splits each line of a string into line objects
   */
  private splitStringToLineObjects(
    text: string,
    indent: number = 0,
    force: boolean = false
  ): ILine[] {
    return text.split("\n").map(v => ({ text: v, indent, force }));
  }

  /** This updates the spinner rotation, and orders a render */
  private updateSpinner() {
    this.nextSpinner = this.spinner();
    this.render();
  }

  /** Moves the cursor to the specified line and index (relative to session start) */
  private moveCursorTo(line: number, index: number) {
    if (line < this.cursorLine) {
      this.write(`\x1B[${this.cursorLine - line}F`);
      this.cursorLine = line;
      this.cursorIndex = 0;
    } else if (line > this.cursorLine) {
      this.write(`\n`.repeat(line - this.cursorLine));
      this.cursorLine = line;
      this.cursorIndex = 0;
    }

    if (index > this.cursorIndex) {
      this.write(`\x1B[${index - this.cursorIndex}C`);
      this.cursorIndex = index;
    } else if (index < this.cursorIndex) {
      if (index === 0) {
        this.write("\r");
      } else {
        this.write(`\x1B[${this.cursorIndex - index}D`);
      }
      this.cursorIndex = index;
    }
  }

  /**
   * Starts the interval timer if there is a spinner in the render queue
   */
  private startTimer() {
    if (!this.renderInterval && this.active) {
      for (const nextRenderLine of this.nextRender) {
        if (nextRenderLine.text.indexOf(SPINNER) !== -1) {
          this.renderInterval = setInterval(this.updateSpinner.bind(this), this.updateFrequency);
          this.debug(chalk.cyan("TIMER"), "Spinner present, starting timer");
          break;
        }
      }
    }
  }

  private stopTimer() {
    if (this.renderInterval) {
      this.debug(chalk.cyan("TIMER"), "Stopping timer");
      clearInterval(this.renderInterval);
      this.renderInterval = false;
      this.render();
    }
  }

  private write(text: string) {
    if (!defaultDebug.enabled) {
      process.stdout.write(text);
    }
  }

  private debug(header: string, text: string) {
    if (defaultDebug.enabled) {
      const HEADER_LENGTH = 6;
      const strippedHeader = stripAnsi(header);
      if (strippedHeader.length < HEADER_LENGTH) {
        header += " ".repeat(HEADER_LENGTH - strippedHeader.length);
      }
      defaultDebug(header + " - " + text);
    }
  }
}

const worker = new DynamicTerminalThread();

process.on("message", msg => {
  if (typeof msg === "object") {
    try {
      switch (msg.cmd) {
        case "START":
          worker.start(msg.options);
          process.send({ status: "started", uuid: msg.uuid });
          break;
        case "STOP":
          worker.stop(msg.commit);
          process.send({ status: "stopped", uuid: msg.uuid });
          break;
        case "DESTROY":
          defaultDebug("Destroying...");
          // The exit hook will automatically trigger cleanup
          process.kill(process.pid, "SIGTERM");
          break;
        case "UPDATE":
          worker.update(msg.text);
          process.send({ status: "updated", uuid: msg.uuid });
          break;
        case "APPEND":
          worker.update(msg.text);
          process.send({ status: "appended", uuid: msg.uuid });
          break;
        case "RENDER":
          if (msg.force === true) {
            worker.resetRender();
          }
          worker.render();
          process.send({ status: "rendered", uuid: msg.uuid });
          break;
        case "RENDER_QUEUE":
          process.send({
            data: worker.getLines(),
            status: "renderQueue",
            uuid: msg.uuid
          });
          break;
        default:
          process.send({ status: "error", uuid: msg.uuid });
          break;
      }
    } catch (err) {
      process.send({ status: "error", error: err, uuid: msg.uuid });
    }
  }
});
