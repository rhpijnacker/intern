import intern from '../../core';
import { getConfig } from '../../core/lib/node/util';
import { getConfigDescription } from '../../core/lib/common/util';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { watch } from 'chokidar';
import { collect, die, print, readJsonFile } from './util';
import { CliContext } from './interfaces';

export const minVersion = '4.0.0';
export const maxVersion = '5.0.0';

export default function install(context: CliContext) {
  const { program, commands, vlog, internDir, testsDir } = context;

  const nodeReporters = [
    'pretty',
    'simple',
    'runner',
    'benchmark',
    'junit',
    'jsoncoverage',
    'htmlcoverage',
    'lcov',
    'cobertura',
    'teamcity'
  ];
  const browserReporters = ['html', 'dom', 'console'];
  const tunnels = ['null', 'selenium', 'saucelabs', 'browserstack', 'cbt'];

  program.on('--help', () => {
    try {
      getConfig().then(({ config }) => {
        const text = getConfigDescription(config);
        if (text) {
          print([`Using config file at ${defaultConfig}:`, '']);
          print(`  ${text}`);
        } else {
          print(`Using config file at ${defaultConfig}`);
        }
      });
    } catch (error) {
      // ignore
    }
  });

  commands.init.action(async options => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    if (!existsSync(testsDir)) {
      try {
        mkdirSync(testsDir);
        vlog('Created test directory %s/', testsDir);
      } catch (error) {
        die('error creating test directory: ' + error);
      }
    }

    try {
      const configFile = defaultConfig;
      let data: any;

      // TODO should this also deal with extended configs?
      if (existsSync(configFile)) {
        data = readJsonFile(configFile);
      } else {
        data = {};
      }

      const testsGlob = join(testsDir, '**', '*.js');
      const resources = {
        suites: [testsGlob],
        functionalSuites: <string[] | undefined>undefined,
        environments: <any>undefined
      };

      if (existsSync(join(testsDir, 'functional'))) {
        const functionalGlob = join(testsDir, 'functional', '**', '*.js');

        resources.suites.push(`!${functionalGlob}`);
        resources.functionalSuites = [functionalGlob];
        resources.environments = [{ browserName: options.browser }];
      }

      const names: (keyof typeof resources)[] = [
        'suites',
        'functionalSuites',
        'environments'
      ];
      for (const name of names) {
        if (await shouldUpdate(name, resources, data)) {
          data[name] = resources[name];
        }
      }

      vlog('Using browser: %s', options.browser);
      vlog('Saved config to %s', configFile);

      writeFileSync(configFile, `${JSON.stringify(data, null, '\t')}\n`);

      print();
      print([
        'Intern initialized! A test directory containing example unit ' +
          `and functional tests has been created at ${testsDir}/.` +
          ` See ${configFile} for configuration options.`,
        '',
        'Run the sample unit test with `intern run`.',
        '',
        'To run the sample functional test, first start a WebDriver ' +
          'server (e.g., Selenium), then run `intern run -w`. The ' +
          `functional tests assume ${options.browser} is installed.`,
        ''
      ]);
    } catch (error) {
      die('error initializing: ' + error);
    } finally {
      rl.close();
    }

    async function shouldUpdate(name: string, resources: any, data: any) {
      if (!(name in resources)) {
        return false;
      }

      if (!(name in data)) {
        return true;
      }

      if (JSON.stringify(resources[name]) === JSON.stringify(data[name])) {
        return false;
      }

      let answer = await new Promise<string>(resolve => {
        print();
        print([
          'The existing config file has the following ' + `value for ${name}:`,
          ''
        ]);
        print('  ', data[name]);
        print();
        print(['The default value based on our project layout is:', '']);
        print('  ', resources[name]);
        rl.question('\n  Should the default be used? ', resolve);
      });

      if (answer.toLowerCase()[0] !== 'y') {
        return false;
      }

      return true;
    }
  });

  commands.run
    .option(
      '-c, --config <file>[@config]',
      `config file to use (default is ${defaultConfig})`
    )
    .option(
      '-f, --fsuites <file|glob>',
      'specify a functional suite to run (can be used multiple times)',
      collect,
      []
    )
    .option(
      '-r, --reporters <name>',
      'specify a reporter (can be used multiple times)',
      collect,
      []
    )
    .option(
      '-s, --suites <file|glob>',
      'specify a suite to run (can be used multiple times)',
      collect,
      []
    )
    .option('-n, --node', 'only run Node-based unit tests')
    .on('--help', () => {
      print('\n');
      print([
        'Node reporters:',
        '',
        `  ${nodeReporters.join(', ')}`,
        '',
        'Browser reporters:',
        '',
        `  ${browserReporters.join(', ')}`,
        '',
        'Tunnels:',
        '',
        `  ${tunnels.join(', ')}`
      ]);
      print();
    })
    .action(async (_args, command) => {
      const { getConfig } = require(join(internDir, 'lib', 'node', 'util'));
      const { config } = await getConfig(command.config);
      const internConfig: { [name: string]: any } = {
        suites: command.suites,
        functionalSuites: command.fsuites,
        reporters: command.reporters
      };

      if (command.grep) {
        internConfig.grep = command.grep;
      }

      if (command.bail) {
        internConfig.bail = true;
      }

      if (command.port) {
        internConfig.port = command.port;
      }

      if (command.timeout) {
        internConfig.timeout = command.timeout;
      }

      if (command.tunnel) {
        internConfig.tunnel = command.tunnel;
      }

      if (command.noInstrument) {
        internConfig.excludeInstrumentation = true;
      }

      if (command.leaveRemoteOpen) {
        internConfig.leaveRemoteOpen = command.leaveRemoteOpen;
      }

      if (command.node) {
        internConfig.environments = ['node'];
      }

      if (command.webdriver) {
        // Clear out any node or general suites
        internConfig.suites = [];
        internConfig.browser = {
          suites: []
        };

        // If the user provided suites, apply them only to the browser
        // environment
        if (command.suites) {
          internConfig.browser.suites.push(...command.suites);
        }

        // If the config had general suites, move them to the browser
        // environment
        if (config.suites) {
          internConfig.browser.suites.push(...config.suites);
        }
      }

      if (command.node && command.webdriver) {
        die('Only one of --node and --webdriver may be specified');
      }

      // 'verbose' is a top-level option
      if (command.parent.verbose) {
        internConfig.debug = true;
      }

      intern.configure(internConfig);
      await intern.run();
    });

  commands.watch = program
    .command('watch [files]')
    .description(
      'Watch test and app files for changes and re-run Node-based ' +
        'unit tests when files are updated'
    )
    .action(async (_files, command) => {
      const { getConfig } = require(join(internDir, 'lib', 'node', 'util'));
      const { config } = await getConfig(command.config);
      const nodeSuites = [
        ...config.suites,
        ...(config.node ? config.node.suites : [])
      ];

      const watcher = watch(nodeSuites)
        .on('ready', () => {
          print('Watching', nodeSuites);
          watcher.on('add', scheduleInternRun);
          watcher.on('change', scheduleInternRun);
        })
        .on('error', (error: Error) => {
          print('Watcher error:', error);
        });

      process.on('SIGINT', () => watcher.close());

      let timer: number;
      let suites = new Set();
      function scheduleInternRun(suite: string) {
        suites.add(suite);
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(async () => {
          suites = new Set();

          const internConfig = {
            debug: command.debug,
            environments: [],
            suites
          };

          intern.configure(internConfig);
          await intern.run();
        });
      }

      intern.configure({ environments: [] });
      await intern.run();
    });

  commands.serve.action(async (_args, command) => {
    const config = command.config || defaultConfig;

    // Allow user-specified args in the standard intern format to be passed
    // through
    // const internArgs = args || [];
    const internConfig: { [name: string]: any } = {
      config,
      serveOnly: true
    };

    if (command.port) {
      internConfig.serverPort = command.port;
    }

    if (command.noInstrument) {
      internConfig.excludeInstrumentation = true;
    }

    intern.configure(internConfig);
    await intern.run();
  });
}

const defaultConfig = 'intern.json';
