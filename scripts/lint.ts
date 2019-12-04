import { lint, log } from './lib/util';
import chalk from 'chalk';

log('Linting...');

try {
  lint('../tsconfig.json');
} catch (error) {
  if (error.name === 'ExecError') {
    log(chalk.red(error.stdout));
    process.exitCode = error.code;
  } else {
    throw error;
  }
}

log('Done linting');
