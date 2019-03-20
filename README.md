<h1 align="center">Dynamic Terminal</h1>

<p align="center">
  <b>Create an efficient dynamic terminal experience</b> <br>
  <sub><i><a href="https://github.com/chjj/blessed">blessed</a> is too much,
  <a href="https://github.com/sindresorhus/log-update">log-update</a> is too little</i></sub>
</p>

<p align="center">
  <a alt="Link to NPM" href="https://www.npmjs.com/package/dynamic-terminal">
    <img src="https://img.shields.io/badge/npm-CB3837.svg?style=flat-square&logo=npm">
  </a>
  <img src="https://img.shields.io/badge/Dynamic_Terminal-__💻-FFDC00.svg?style=flat-square">
  <img src="https://img.shields.io/github/license/marcuscemes/dynamic-terminal.svg?style=flat-square">
  <img src="https://img.shields.io/bundlephobia/min/dynamic-terminal.svg?style=flat-square&colorB=0074D9">
  <img src="https://img.shields.io/badge/Make_the_web-nicer-7FDBFF.svg?style=flat-square">
</p>

<p align="center"><img width="600" src="https://i.ibb.co/Y0twvvZ/dynamic-terminal.gif" alt="An example of usage"></p>

<p align="center"><sub>Blame the GIF image for the stuttering</sub></p>

## Features

- ⚡ **Fast** - it repaints only what's changed since the last render
- 🔥 **Multithreaded** - all work is offloaded to another thread
- 📦 Attempts to compensate for terminal resizing and text wrapping
- ✂️ **Cross platform** - Tested on Windows, macOS and Linux
- 😊 **Easy** - Just pass a string, DT will do the rest

<p align="center">
  <br>
  <b>Quick Links</b>
  <br>
  <a href="#why">Why</a>
  •
  <a href="#getting-started">Getting started</a>
  •
  <a href="#usage">Usage</a>
  •
  <a href="#the-line-object">Line Object</a>
  •
  <a href="#api">API</a>
  •
  <a href="#typescript">Typescript</a>
</p>

## Why

I loved the idea of [Listr](https://github.com/samverschueren/listr), it creates a beautiful dynamic
terminal output. However, the library focusses on simplifying the task scheduling process, and
doesn't let you change the colours of the spinner for example, these are hard coded in to the
library. Another annoyance is that you can't modify the task message when completed!

This began as an experiment, to see whether it could be feasibly done. I could take care of the task
concurrency process, and wanted something that would only focus on updating the view. Something like
React, that let's you design the logic, and tries to keep the view rendered as efficiently as
possible.

Of course there's [Ink](https://github.com/vadimdemedes/ink) and
[DraftLog](https://github.com/ivanseidel/node-draftlog), and the good old fashioned
[log-update](https://github.com/sindresorhus/log-update), but most of these libraries replace the
entire contents of the screen. This was another issue that I had, on some terminals large screen
paints can cause annoying flickering, while also greatly decreasing the efficiency of
[asciinema](https://github.com/asciinema/asciinema) and svg-term.

I wanted to create a simple solution. My idea was to have an array of lines represented as
Javascript objects, these can be passed down to tasks by reference. They keep they object up to
date, and DT keeps the terminal screen up to date, by only "painting" over portions of the screen
that needs to be changed. Just to make my life difficult, I also decided to add a super simple way
of adding a spinner, support for ANSI colour codes, text-wrapping and terminal resizing compensation
in between renders 😊.

## Getting started

### Prerequisites

Dynamic Terminal was written in Javascript, and only works with Node.js. If you use something else,
it's not worth the effort or the loss in efficiency.

It's designed for server-side CLI tools, I wouldn't trust it for anything that's production based.
Bear in mind that old terminals might freak out, and stdout redirection will probably result in
garbled output. It might be a good idea to detect if the output is TTY, and use traditional logging
instead that doesn't mess with the cursor.

### 📦 Project installation

Open up a terminal session in your project folder and execute:

```bash
$ npm install --production dynamic-terminal
```

This installs dynamic-terminal locally in your project. It's as easy as that.

## Usage

To use Dynamic Terminal, you can import the module using the new ES6 import syntax, or use old
fashioned `require` destructuring. The imported class can be used to manage the worker.

```javascript
import { DynamicTerminal } from "dynamic-terminal"; // Typescript
const { DynamicTerminal } = require("dynamic-terminal"); // legacy

const dt = new DynamicTerminal();
```

When the DynamicTerminal class is instantiated, a new worker is automatically spawned. If it is
destroyed, you will have to restart it with the `.startWorker()` function.

### Promises

All functions that communicate with the worker, such as `start`, `update`, `stop`, return ES6
Promises. It is not possible to remain synchronous, as the class has to communicate with the worker
which is a separate process. Waiting is not necessary, but can be safer sometimes.

These Promises never reject and the reason of failure can be queried by accessing the `lastError`
property on the class itself:

```javascript
if ((await dt.start()) === false) console.error(dt.lastError);
```

<p align="center"><sub>Promises will automatically resolve after 10 seconds to prevent endless hanging</sub></p>

### Starting a new terminal session

A terminal session is a re-writable piece of history in the terminal. When you start a new terminal
session, you may write, overwrite and clear anything that was displayed during that session.

```javascript
await dt.start();
```

The rest of the Dynamic Terminal functions may now be used.

### Writing to a terminal session

```javascript
// Simple usage
dt.update("I'm doing stuff\nCheck back later...");

// Advanced usage, see below
const lines = [{ text: "I'm doing stuff", indent: 2 }, { text: "Check back later....", indent: 2 }];
dt.update(lines);
```

<p align="center"><sub>This will replace anything that was written previously</sub></p>

### Stopping a terminal session

When stopping a terminal session, you may to choose to keep (commit) or erase the session,
effectively clearing everything that was written and returning the cursor to the previous position.

```javascript
if (success) {
  await dt.stop(true); // commit the text to screen
} else {
  await dt.stop(false); // erase the session
}
```

### Destroying the session

This will effectively kill the worker. This is important if you would like to exit from your
application gracefully by exhausting the Node.js event loop of work.

By not destroying the session, Node.js will be unable to quit without calling `process.exit();`

```javascript
if (!dt.destroy()) process.exit(); // Returns a boolean
```

## The Line Object

The `Line` object is the preferred way of providing text data to Dynamic Terminal. The best way to
update the screen is to provide an array of `Line` objects to the update function. These `Line`
objects can be distributed throughout your program to be updated by reference. You can then push the
changes to Dynamic Terminal whenever you like.

Despite the name, a line object can actually span several lines. It will be wrapped automatically
and split on any `\n` new lines in the text property.

```javascript
const lines = [{ text: "" }, { text: "" }];
const updater = setInterval(() => dt.update(lines), 200);

await Promise.all(runTaskOne(lines[0]), runTaskTwo(lines[1]));

clearInterval(updater);
```

<p align="center"><sub>The task functions can do whatever they like with their line, updates get sent every 200ms</sub></p>

Line objects can have three different properties:

- `text` **{string}** The text to display. Will be split if text-wrapping would occur
- `indent` **{number}** The indentation level, this will be coppied over split `Line` objects
- `force` **{boolean}** Repaint the entire line instead of just repainting portions.

### Spinners

Spinners are cool. DT makes it easy to add one. The DT class exposes five constants that you can
use. The spinner is the only dynamic element, it is a placeholder (currently `_*_`) that is
replaced with a spinner frame upon each render.

```javascript
dt.update((DynamicTerminal.SPINNER = " Hold on... I'm working!"));
```

<p align="center"><sub>This will prepend a pretty cyan spinner! The colour can be changed with the config</sub></p>

**Note:** The constants are static properties, so they can be accessed through the imported class,
and not through an instantiated class.

The other constants are `TICK`, `CROSS`, `TICK_RAW` and `CROSS_RAW`. The RAW versions are unicode
symbols, while the non-RAW versions are also coloured green and red.

## API

This documentation uses the [Typescript](https://www.typescriptlang.org/) syntax. Dynamic Terminal
also has full Typescript typings bundled.

<p align="center">
  <b>Class Methods</b>
  <br>
  <b><a href="#dynamicterminalstart-options-options--promiseboolean">start</a>
  •
  <a href="#dynamicterminalstop-commit-boolean--true--promiseboolean">stop</a>
  •
  <a href="#dynamicterminaldestroy-void--boolean">destroy</a>
  •
  <a href="#dynamicterminalupdate-lines-string--string--line--line--promiseboolean">update</a></b>
  •
  <a href="#dynamicterminalappend-lines-string--string--line--line--promiseboolean">append</a>
  •
  <a href="#dynamicterminalstartworker-void--void">startWorker</a>
  •
  <a href="#dynamicterminalforcerender-force-boolean--false--promiseboolean">forceRender</a>
  •
  <a href="#dynamicterminalgetrenderqueue-void--promiseline">getRenderQueue</a>
</p>

### DynamicTerminal _[class]_

The main class that is used to interact with the worker. This acts as a controller, as well as
exposing a few useful properties.

**Static Properties**

- `SPINNER` **{string}** The spinner placeholder
- `TICK` **{string}** A green tick
- `TICK_RAW` **{string}** A colour-less tick
- `CROSS` **{string}** A red cross
- `CROSS_RAW` **{string}** A colour-less cross

**Properties**

- `lastError` **{string}** The last error that occurred

**Example**

```javascript
const { DynamicTerminal } = require("dynamic-terminal");
const myBetterTick = chalk.cyan(DynamicTerminal.TICK_RAW);
const dynamicTerminal = new DynamicTerminal();
```

### dynamicTerminal.start( options: _Options_ ): _Promise\<boolean\>_

Used to start a new terminal session. This will can be actively written to until it is stopped.
Resolved into the completion success.

**Options**

The options object may be sniffed out through Typescript typings, nevertheless, here are the
available properties:

- `disableInput` **{boolean}** Sets the terminal to RAW mode, ignoring keypresses (these mess up the
  output). This will also intercept interrupt signals, so beware.
- `hideCursor` **{boolean}** Hides the cursor in terminal, for a cleaner experience
- `spinnerColour` **{function}** A function that will apply the colour codes to the raw spinner. See
  [chalk](https://github.com/chalk/chalk).
- `updateFrequency` **{number}** The interval in ms between renders when using a spinner. Affects
  the spin speed.
- `repaintOnResize` **{boolean}** Repaint everything if terminal was resized, instead of gracefully
  trying to compensate for wrapped lines.

**Example**

```javascript
await dynamicTerminal.start();
```

### dynamicTerminal.stop( commit: _boolean_ = true ): _Promise\<boolean\>_

Used to stop the terminal session and optionally commit the session to the terminal (keep the
rendered text). Resolves into the completion success.

**Example**

```javascript
await dynamicTerminal.stop(false);
```

### dynamicTerminal.destroy( _void_ ): _boolean_

Destroys the worker, allowing the Node.js event loop to quit gracefully. If a terminal session was
active, it will be stopped and committed.

**Example**

```javascript
dynamicTerminal.destroy();
```

### dynamicTerminal.update( lines: *string | string[] | Line | Line[]* ): *Promise\<boolean\>*

Replaces the entire contents of the terminal session. If the provided argument is not of type
Line[], it will be manually converted. Line objects will also be split if screen wrapping would
occur, with indentation and forcing being preserved.

**Example**

```javascript
await dynamicTerminal.update("line1line2");
await dynamicTerminal.update(myLineObjectsArray);
```

### dynamicTerminal.append( lines: *string | string[] | Line | Line[]* ): *Promise\<boolean\>*

Appends to current open session. Quick and dirty, changes will be lost if the session is updated.

**Example**

```javascript
await dynamicTerminal.append("Add a third line");
```

### dynamicTerminal.startWorker( _void_ ): _void_

Starts a new worker in case it was destroyed, or it is no longer connected for some abnormal reason.

**Example**

```javascript
dynamicTerminal.startWorker();
```

### dynamicTerminal.forceRender( force: _boolean_ = false ): _Promise\<boolean\>_

Used to trigger a render of the screen, as the screen is only repainted if an update was pushed, or
a `SPINNER` is present. Can get rid of artifacts.

The `force` paramter will ensure that the _entire_ session is repainted, and not just trigger a
change-detection assisteds render.

**Example**

```javascript
await dynamicTerminal.forceRender(true);
```

### dynamicTerminal.getRenderQueue( _void_ ): _Promise\<Line[]\>_

Lost track of the terminal output? This will help you get back what you sent to the worker.

**Example**

```javascript
const lines = await dynamicTerminal.getRenderQueue();
lines[0].text = DynamicTerminal.SPINNER + "I forgot to add a spinner...";
dynamicTerminal.update(lines);
```

### _private_ dynamicTerminal.send( data: _any_, timeout: _number_ = 10000 ): _Promise\<any\>_

A private function that is used to send raw data to the worker, and resolve the response. The
response data is recognized by generating a UUID for each message, the worker will include the same
UUID in its response.

This serves as the base of the other functions, and should not be called directly.

**Example**

```javascript
const response = await dynamicTerminal.send({
  cmd: "UPDATE",
  data: "I like to get my hands dirty."
});
if (response.error) console.error("Darn. I don't know how to use this.");
```

## Render

The rendering process is efficient, and uses the help of the `Change Algorithm` to calculate which
areas of the screen need to be repainted. The Change Algorithm will attempt to correctly slice out
changes, while preserving the correct ANSI codes, and searching for them if necessary. If the
terminal was resized since the last render, the previous render will be _reflowed_ to compensate for
any wrapped lines.

Bear in mind that complex ANSI operations will just not work... For that you may want to look into
[blessed](https://github.com/chjj/blessed).

The render function is called whenever a new update is pushed, or if a `SPINNER` is present in the
render buffer, in which case it will be called with an interval. To change the interval frequency,
see the [options](#dynamicterminalstart-options-options--promiseboolean) that can be passed to the
worker.

## Typescript

The entire project is written in Typescript, and all the public functions have typings applied to
them.

Using an editor like [Visual Studio Code](https://code.visualstudio.com/), you can benefit from
autocompletion, type-checking, object property hinting and helpful descriptions of config keys and
functions as you type.

Even without modern editor, you can consult the generated `*.d.ts` typing files for correct API
usage.

### Debugging

Dynamic Terminal exposes two [debug](https://www.npmjs.com/package/debug) namespaces that you can
tap into to monitor what's going on behind the scenes. These can be activated with the `DEBUG`
environmental variable.

**DTTRender**

This debug namespace will give you a large readout of every screen render. This is useful when
figuring out why the output might be incorrect. _When this debug option is active, DynamicTerminal
will not print any renders to the terminal._

**DTTCommand**

This prints live information about received data from the IPC channel, and what the thread is
currently executing. Useful if the worker isn't responding to commands.

**Example**

```bash
set DEBUG=DTT*    // Windows
export DEBUG=DTT* // Linux
```

<p align="center"><sub>This will set the DEBUG environmental variable in a terminal session, enabling all debug namespaces for the DT Thread</sub></p>

## Development

You may clone and build the module yourself. Dynamic Terminal uses [Travis CI](https://travis-ci.com/MarcusCemes/dynamic-terminal) to run tests on all pushed changes, automatically deploying to npm when a significant operational change is made and all the tests have passed.
Please make sure that your contributions pass tests before submitting a Pull Request, and that your commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.3/) specification.

<p align="center">
  <a href="https://travis-ci.com/MarcusCemes/dynamic-terminal/branches">
    <img src="https://img.shields.io/travis/com/MarcusCemes/dynamic-terminal/master.svg?label=MASTER&logo=travis&style=for-the-badge" alt="Build Status - master">
  </a>
  &nbsp;&nbsp;
  <a href="https://travis-ci.com/MarcusCemes/dynamic-terminal/branches">
    <img src="https://img.shields.io/travis/com/MarcusCemes/dynamic-terminal/develop.svg?label=DEVELOP&logo=travis&style=for-the-badge" alt="Build Status - develop">
  </a>
</p>

## Built With

- [NodeJS](https://nodejs.org) - Powered by Chrome's V8 Javascript engine

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the
[tags on this repository](https://github.com/MarcusCemes/dynamic-terminal/tags).

## Authors

- **Marcus Cemes** - _Project Owner_ - [Website](https://mastermovies.co.uk/) -
  [GitHub](https://github.com/MarcusCemes)

## License

This project is licensed under the **Apache 2.0** License - see the [LICENSE.md](LICENSE.md) file
for details

<!--
Hidden section for better npms.io scoring, as it doesn't recognize HTML badges

[![npm](https://img.shields.io/badge/npm-CB3837.svg?style=flat-square&logo=npm)](https://www.npmjs.com/package/dynamic-terminal)

![Project name](https://img.shields.io/badge/Dynamic_Terminal-__💻-FFDC00.svg?style=flat-square)

![License](https://img.shields.io/github/license/marcuscemes/dynamic-terminal.svg?style=flat-square)

![Project size](https://img.shields.io/bundlephobia/min/dynamic-terminal.svg?style=flat-square&colorB=0074D9)

![Make the web lighter](https://img.shields.io/badge/Make_the_web-nicer-7FDBFF.svg?style=flat-square)

[![Build status - master](https://img.shields.io/travis/com/MarcusCemes/dynamic-terminal/master.svg?label=MASTER&logo=travis&style=for-the-badge)](https://travis-ci.com/MarcusCemes/dynamic-terminal/branches)

[![Build status - master](https://img.shields.io/travis/com/MarcusCemes/dynamic-terminal/develop.svg?label=DEVELOP&logo=travis&style=for-the-badge)](https://travis-ci.com/MarcusCemes/dynamic-terminal/branches)

-->
