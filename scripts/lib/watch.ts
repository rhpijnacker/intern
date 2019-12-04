import chalk from 'chalk';
import { exec, ChildProcessWithoutNullStreams } from 'child_process';
import { watch, FSWatcher } from 'chokidar';
import { dirname, join } from 'path';
import { mkdir, rm } from 'shelljs';
import { copy, log } from './util';

function copyAll(file: string, dstDir: string | string[]) {
  if (!Array.isArray(dstDir)) {
    dstDir = [dstDir];
  }
  dstDir.forEach(dir => {
    copy(file, dir);
    log(`Copied ${file} -> ${dir}`);
  });
}

function remove(file: string, dstDir: string | string[]) {
  if (!Array.isArray(dstDir)) {
    dstDir = [dstDir];
  }
  dstDir.forEach(dir => {
    try {
      const path = join(dir, file);
      rm(path);
      log(`Removed ${path}`);
    } catch (error) {
      // ignore
    }
  });
}

function logProcessOutput(
  name: string,
  text: string | Buffer,
  errorTest?: RegExp
) {
  if (!text) {
    return;
  }

  if (typeof text !== 'string') {
    text = text.toString('utf8');
  }
  let lines = text
    .split('\n')
    .filter(line => !/^\s*$/.test(line))
    .filter(line => !/^Child$/.test(line))
    .map(line => line.replace(/\s+$/, ''))
    // Strip off timestamps
    .map(line =>
      /^\d\d:\d\d:\d\d \w\w -/.test(line)
        ? line.slice(line.indexOf('-') + 2)
        : line
    );
  if (errorTest) {
    lines = lines.map(line => (errorTest.test(line) ? chalk.red(line) : line));
  }
  lines.forEach(line => {
    log(`[${name}] ${line}`);
  });
}

/**
 * Return a file watcher that will copy changed files to an output dir
 */
export function watchFiles(
  patterns: string[],
  dstDir: string | string[]
): FSWatcher {
  if (!Array.isArray(dstDir)) {
    dstDir = [dstDir];
  }

  dstDir.forEach(dir => mkdir('-p', dirname(dir)));

  const watcher = watch(patterns)
    .on('ready', () => {
      log(`Watching files for ${patterns[0]} => ${dstDir}`);
      watcher.on('add', (file: string) => copyAll(file, dstDir));
      watcher.on('change', (file: string) => copyAll(file, dstDir));
      watcher.on('unlink', (file: string) => remove(file, dstDir));
    })
    .on('error', (error: Error) => {
      log(chalk.red('!!'), 'Watcher error:', error);
    });

  return watcher;
}

/**
 * Execute a process in the background
 */
export function watchProcess(
  name: string,
  command: string,
  errorTest?: RegExp
) {
  const proc = exec(command) as ChildProcessWithoutNullStreams;
  proc.stdout.on('data', (data: Buffer) => {
    logProcessOutput(name, data.toString('utf8'), errorTest);
  });
  proc.stderr.on('data', (data: Buffer) => {
    logProcessOutput(name, data.toString('utf8'), errorTest);
  });
  proc.on('error', () => {
    process.exit(1);
  });
}
