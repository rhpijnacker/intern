// Build, and optionally continue watching and rebuilding a project

// Use native tsc, webpack, and stylus watchers.
// Use chokidar to create file watchers to copy changed files.
// When the script is first run, do a complete build. If a 'watch' argument is
// provided, start watchers.

import { writeFileSync } from 'fs';
import { baseDir, copy, copyAll, exec, lint, log, logError } from './lib/util';
import { watchProcess } from './lib/watch';
import * as pkgJson from '../package.json';

const args = process.argv.slice(2);
const watchMode = args[0] === 'watch';

// -----------------------------------------------------------------
// Typescript
// -----------------------------------------------------------------
for (const suffix of ['lib', 'bin']) {
  try {
    const tsconfig = `${baseDir}/tsconfig-${suffix}.json`;

    log(`Linting ${suffix}...`);
    lint(tsconfig);

    log(`Compiling ${suffix}...`);
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
const buildDir = `${baseDir}/_build`;
copyAll(
  [{ base: 'src', pattern: 'src/**/*.{styl,d.ts,html,js.png}' }],
  buildDir
);
copy('schemas', buildDir);
copy('README.md', buildDir);
copy('LICENSE', buildDir);

delete pkgJson['lint-staged'];
delete pkgJson['pre-commit'];
delete pkgJson.prettier;
delete pkgJson.devDependencies;
writeFileSync(`${buildDir}/package.json`, JSON.stringify(pkgJson, null, '  '));

if (watchMode) {
  // handleError(new Error('Watch mode is currently disabled'));
  // createFileWatcher(resources[dest], dest);
}

log('Done building');

function handleError(error: Error) {
  if (error.name === 'ExecError') {
    logError((<any>error).stderr || (<any>error).stdout);
    process.exit((<any>error).code);
  } else {
    throw error;
  }
}
