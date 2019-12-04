// Build, and optionally continue watching and rebuilding a project

// Use native tsc, webpack, and stylus watchers.
// Use chokidar to create file watchers to copy changed files.
// When the script is first run, do a complete build. If a 'watch' argument is
// provided, start watchers.

import chalk from 'chalk';
import { baseDir, copy, copyAll, exec, lint, log } from './lib/util';
import { watchProcess } from './lib/watch';

const args = process.argv.slice(2);
const watchMode = args[0] === 'watch';

// -----------------------------------------------------------------
// Typescript
// -----------------------------------------------------------------
try {
  const tsconfig = `${baseDir}/tsconfig-src.json`;

  log('Linting...');
  lint(tsconfig);

  log('Compiling...');
  if (watchMode) {
    watchProcess('tsc', `npx tsc -p ${tsconfig} --watch`, /\berror TS\d+:/);
    // const proc = spawn('node', [tsc, '-p', tsconfig, '--watch']);
    // watchProcess(tag, proc, /\berror TS\d+:/);
  } else {
    exec(`npx tsc -p ${tsconfig}`);
  }
} catch (error) {
  handleError(error);
}

// -----------------------------------------------------------------
// Webpack
// -----------------------------------------------------------------
try {
  if (watchMode) {
    // handleError(new Error('Watch mode is currently disabled'));
    // const proc = spawn('node', [
    //   webpack,
    //   '--config',
    //   webpackConfig,
    //   '--watch'
    // ]);
    // watchProcess('webpack', proc, /^ERROR\b/);
  } else {
    exec('npx webpack', { cwd: baseDir });
  }
} catch (error) {
  handleError(error);
}

// -----------------------------------------------------------------
// Resources
// -----------------------------------------------------------------
copyAll(['src/**/*.{styl,d.ts,html,js.png}'], `${baseDir}/_build`);
copy('schemas', `${baseDir}/_build/src`);
copy('package.json', `${baseDir}/_build/src`);
copy('README.md', `${baseDir}/_build/src`);
copy('LICENSE', `${baseDir}/_build/src`);

if (watchMode) {
  // handleError(new Error('Watch mode is currently disabled'));
  // createFileWatcher(resources[dest], dest);
}

log('Done building');

function handleError(error: Error) {
  if (error.name === 'ExecError') {
    log(chalk.red((<any>error).stderr || (<any>error).stdout));
    process.exit((<any>error).code);
  } else {
    throw error;
  }
}
