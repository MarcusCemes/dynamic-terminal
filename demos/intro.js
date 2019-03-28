const { DynamicTerminal } = require("../dist/main/index.js");
const chalk = require("chalk");
const figures = require('figures');

const dt = new DynamicTerminal();

const lines = [];

async function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

(async () => {
  try {

    process.stdout.write('\033c'); // Clear the screen
    dt.start({ repaintOnResize: true });

    for (let i=0; i<=6; i++)
      lines.push({ text: '', indent: '' });

    lines[0].indent = 10;
    openingBanner(lines[0]);

    await sleep(1000);
    lines[1].indent = 15;
    typeWriter(lines[1], 'Hi');

    await sleep(1000);
    lines[2].indent = 0;
    await typeWriter(lines[2], 'Right now I\'m using Dynamic Terminal', 20);

    await sleep(1000);
    await clearLines(lines, 20);


    lines[2].indent = 5;
    await typeWriter(lines[2], "It lets you create dynamic terminal output.", 21);
    await sleep(500);

    lines[3].indent = 3;
    typeWriter(lines[3], "Each line is represented as an object like so:", 20);
    await sleep(500);

    lines[4] = { text: '', indent: 6 };
    await typeWriter(lines[4], "{ text: \"Running task...\", indent: 2 }", 22);
    lines[4].text = `{ ${chalk.red('text')}: ${chalk.green("\"Running task...\"")}, ${chalk.red('indent')}: ${chalk.green('2')} }`;
    update();
    await sleep(2000);
    await clearLines(lines, 20);
    lines[4].force = false;

    lines.forEach(v => v.indent = 2);
    typeWriter(lines[0], 'Full control over each line. An optimized Change', 5);
    await sleep(100);
    typeWriter(lines[1], 'algorithm compares the previous and new render,', 5);
    await sleep(100);
    typeWriter(lines[2], 'making sure that ONLY differences are updated, and', 5);
    await sleep(100);
    typeWriter(lines[3], "not the whole screen.", 5)

    await sleep(2000);
    typeWriter(lines[5], "All the work is offloaded to a separate thread.", 5);
    await sleep(100);
    typeWriter(lines[6], 'Any action returns an ES2015 Promise. Never slow', 5);
    await sleep(100);
    lines[7] = { text: '', indent: 2 };
    typeWriter(lines[7], 'down your main thread with useless console logic.', 5);

    await sleep(2000);
    lines[8] = { text: chalk.cyan(">> That's why it's so fast. <<"), indent: 9 };
    update();

    await sleep(4000);
    for (let i=0; i<=8; i++) {
      lines[i].text = '';
      update();
      await sleep(200);
    }

    typeWriter(lines[0], "Easily display different running tasks\nand update them as things go wrong!");
    lines[1] = { text: DynamicTerminal.SPINNER + " Looking for your password...", indent: 4 };
    lines[2] = { text: DynamicTerminal.SPINNER + " Stealing your SSH keys...", indent: 4 };
    lines[3] = { text: chalk.green(DynamicTerminal.TICK) + " I didn't even need to do anything", indent: 4 };
    update();
    lines[4].indent = 4;
    await progressBar(lines[4]).catch((err) => { dt.stop(); setTimeout( () => console.error(err), 2000); });

    lines[1] = { text: chalk.red(DynamicTerminal.CROSS) + " Damn. I didn't find any!", indent: 4 };
    update();

    await sleep(1000);
    lines[2] = { text: DynamicTerminal.SPINNER + " Noticed how I'm still spinning?", indent: 4 };
    update();

    await sleep(2000);
    lines.forEach(v => v.text = '');
    lines[0].text = "And did I mention...";
    update();

    await sleep(400);
    lines[2] = `ANSI ${chalk.red('colour codes')} are supported?`;
    update();

    await sleep(400);
    lines[2] = `ANSI ${chalk.green('colour codes')} are supported?`;
    update();

    await sleep(400);
    lines[2] = `ANSI ${chalk.cyan('colour codes')} are supported?`;
    update();

    await sleep(400);
    lines[2] = `ANSI ${chalk.blue('colour codes')} are supported?`;
    update();

    await sleep(400);
    lines[2] = `ANSI ${chalk.yellow('colour codes')} are supported?`;
    update();

    await sleep(400);


    await dt.update([{ text: `${chalk.green(figures.tick)} I'm done showing off.`, indent: 2 }, { text: "Let's see what you can do!", indent: 4 }]);
    await sleep(500);
    await dt.stop();
    await sleep(500);
    dt.destroy();

  } catch (err) {
    dt.stop();
    console.error('Error in demo:');
    console.error(err);
    dt.destroy();
    process.exit();
  }
})();


function update() {
  dt.update(lines);
}

function typeWriter(line, text, interval = 20) {
  let cursor = 0;
  let printed  = '';
  let timer;

  return new Promise(resolve => {
    timer = setInterval(() => {
      printed = text.substring(0, cursor);
      line.text = printed;
      update();
      cursor++;
      if (cursor > text.length) {
        if (cursor > line.text.length) {
          clearInterval(timer);
          resolve(true);
        }
        line.text += ' ';
       };
    }, interval);
  });
}

function clearLines(lines, interval = 50) {
  let finished;
  let timer;
  return new Promise(resolve => {
    timer = setInterval(() => {
      finished = true;
      for (const line of lines) {
        if (line.text.length > 0) {
          line.text = line.text.substring(0, line.text.length - 1);
          finished = false;
        }
      }
      if (finished) {
        clearInterval(timer);
        resolve();
      }
      update();
    }, interval);
  });

}

function openingBanner(line) {

  const customCursor = '█';
  let cursor = 0;
  let printed  = '';
  let target = ' -- DEMO --'
  let interval;

  return new Promise(resolve => {
    interval = setInterval(() => {
      printed = target.substring(0, cursor);
      printed += customCursor;
      printed = printed.substring(0, target.length);
      line.text = printed;
      update();
      cursor++;
      if (cursor > target.length) { clearInterval(interval); resolve(true) };
    }, 20);
  });
}

function progressBar(line) {

  const block = '█';
  let percent = 0;
  let interval;
  let removeInterval = false;

  return new Promise(resolve => {
    interval = setInterval(() => {
      const filled = Math.min(Math.floor(25 * percent), 25);
      const empty = Math.max(25 - filled, 0);
      line.text = `Scanning... [${block.repeat(filled)}${".".repeat(empty)}] ${Math.floor(percent*100)}%`;
      update();
      if (removeInterval) { clearInterval(interval); resolve(true) }
      percent = Math.min(1, percent + Math.random() * 0.01);
      if (percent >= 1) { removeInterval = true; };
    }, 20);
  });
}
