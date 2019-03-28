import chalk from "chalk";
import child_process from "child_process";
import path from "path";
import { v4 as uuid } from "uuid";

import { CROSS, ILine, IOptions, SPINNER, TICK } from "./DynamicTerminalThread";

/**
 * Terminal Tasker
 * Provides an interface to the DynamicTerminalThread.
 *
 * An optimized terminal logging utility that lets you keep track of several
 * lines of output, updating them dynamically with ANSI colour codes
 * and spinners.
 */
export class DynamicTerminal {
  public static SPINNER = SPINNER;
  public static TICK = chalk.green(TICK);
  public static CROSS = chalk.red(CROSS);
  public static TICK_RAW = TICK;
  public static CROSS_RAW = CROSS;

  public lastError: string;

  private worker: child_process.ChildProcess = null;

  constructor() {
    this.startWorker();
  }

  /** Start the write worker if it's not already started. This is only necessary if you have called .destroy() */
  public startWorker() {
    if (!this.worker) {
      try {
        // If debugging, bind to a FREE port otherwise it will just fail silently...
        const isDebug = /--debug|--inspect/.test(process.execArgv.join(' '));
        this.worker = child_process.fork(path.join(__dirname, "/DynamicTerminalThread.js"), [], {
          execArgv: isDebug ? ["--inspect=0"] : []
        });
        if (!this.worker || !this.worker.connected) { throw null; }
        this.worker.setMaxListeners(32); // Fast updates may exceed the default limit
        this.worker.once("disconnect", () => (this.worker = null));
      } catch (err) {
        throw new Error("Could not start a child process!\n" + err.message || err);
      }
    }
  }

  /**
   * Starts a new terminal session. Text may be written to the terminal
   * using the write and replace functions. Anything may be replaced
   * that was written after starting the session.
   *
   * @param {IOptions} options Options that are used to start the writer thread
   * @returns {Promise} Promise that resolved into a boolean with success status
   */
  public async start(options?: IOptions): Promise<boolean> {
    const worker = this.worker;
    if (!worker) {
      this.lastError = "No worker! Try restarting the worker";
      return false;
    }
    const response = await this.send({ cmd: "START", options });
    if (response && response.status === "started") {
      return true;
    }
    return false;
  }

  /**
   * Stops the terminal session, STDOUT will be released, and the text
   * that was written may either be committed (kept) or erased.
   *
   * **To destroy the worker, call the destroy() method**. This will terminate
   * the child process that can keep node from closing.
   *
   * @param {boolean} commit Whether written text should persist
   * @returns {Promise} Promise that resolved into a boolean with success status
   */
  public async stop(commit: boolean = true): Promise<boolean> {
    const worker = this.worker;
    if (!worker) {
      this.lastError = "No worker! Try restarting the worker";
      return false;
    }
    const response = await this.send({ cmd: "STOP", commit });
    if (response && response.status === "stopped") {
      return true;
    }
    return false;
  }

  /**
   * Sends the destroy command to the worker. This will tell it to gracefully
   * terminate, closing all open handles and event listeners.
   */
  public destroy(): boolean {
    if (this.worker) {
      this.worker.send({ cmd: "DESTROY" });
      this.worker = null;
      return true;
    }
    return false;
  }

  /**
   * Updates the entire render queue
   *
   * @param {string | ILine | string[] | ILine[]} text May be a string with new lines,
   * an array of strings, or an array of Line objects. Strings will automatically be
   * converted to Line objects. Objects are easy to pass to functions for update-by-reference,
   * however the changes still ned to be pushed via this method.
   */
  public async update(text: string | ILine | string[] | ILine[]): Promise<boolean> {
    const worker = this.worker;
    if (!worker) {
      this.lastError = "No worker! Try restarting the worker";
      return false;
    }
    const response = await this.send({ cmd: "UPDATE", text });
    if (response && response.status === "updated") {
      return true;
    }
    return false;
  }

  /**
   * Adds a new line to the render queue
   *
   * @param {string | ILine | string[] | ILine[]} text May be a string with new lines,
   * an array of strings, or an array of Line objects. Strings will automatically be
   * converted to Line objects. Objects are easy to pass to functions for update-by-reference,
   * however the changes still ned to be pushed via this method.
   */
  public async append(text: string | ILine | string[] | ILine[]): Promise<boolean> {
    const worker = this.worker;
    if (!worker) {
      this.lastError = "No worker! Try restarting the worker";
      return false;
    }
    const response = await this.send({ cmd: "APPEND", text });
    if (response && response.status === "appended") {
      return true;
    }
    return false;
  }

  /**
   * Forces a render of the terminal. Usually this is not necessary, as rendering
   * is intelligently scheduled when updates are required.
   *
   * @param {boolean} force Whether the entire screen should be rewritten. This will
   * remove ghost text or bugs that were not caught by the change algorithm.
   */
  public async forceRender(force: boolean): Promise<boolean> {
    const worker = this.worker;
    if (!worker) {
      this.lastError = "No worker! Try restarting the worker";
      return false;
    }
    const response = await this.send({ cmd: "RENDER", force });
    if (response && response.status === "rendered") {
      return true;
    }
    return false;
  }

  /**
   * Requests the current render queue. This is an asynchronous operation,
   * as the worker thread must be contacted.
   */
  public async getRenderQueue(): Promise<ILine[]> {
    const worker = this.worker;
    if (!worker) {
      this.lastError = "No worker! Try restarting the worker";
      return [];
    }
    const response = await this.send({ cmd: "RENDER_QUEUE" });
    if (response && response.status === "rendered") {
      return response.data;
    }
    return [];
  }

  /** Sends a message with a uuid tag, and resolves when the correct UUID is returned */
  private async send(data: any, timeout: number = 10000): Promise<any> {
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      const id = uuid();

      let timeoutTimer: NodeJS.Timeout;

      const handler = msg => {
        if (msg.uuid === id) {
          worker.removeListener("message", handler);
          clearTimeout(timeoutTimer);
          resolve(msg);
        }
      };

      timeoutTimer = setTimeout(() => {
        worker.removeListener("message", handler);
        this.lastError = "Communication timeout";
        resolve(null);
      }, timeout);
      timeoutTimer.unref();

      worker.on("message", handler);
      worker.send({ ...data, uuid: id }, err => {
        if (err) { reject(err); }
      });
    });
  }
}
