# Customisation

<!-- vim-markdown-toc GFM -->
* [Custom interfaces](#custom-interfaces)
	* [As a standard module (for tests written in JavaScript)](#as-a-standard-module-for-tests-written-in-javascript)
	* [As a loader plugin (for tests written in other languages)](#as-a-loader-plugin-for-tests-written-in-other-languages)
* [Custom executors <span class="versionBadge">3.0</span>](#custom-executors-span-classversionbadge30span)
* [Custom reporters](#custom-reporters)

<!-- vim-markdown-toc -->

## Custom interfaces

Custom interfaces allow Intern to understand test files written for other testing systems—and even other languages! If you want to use Intern but don’t want to spend time and energy converting tests you’ve already written for another test system, writing a custom interface may be the quickest solution.

Any interface in Intern, including a custom interface, is responsible for doing three things:

1.  Creating new instances of [`intern/lib/Suite`](https://theintern.github.io/intern/#suite-object) for each test suite defined in the test file
2.  Creating new instances of [`intern/lib/Test`](https://theintern.github.io/intern/#test-object) for each test function defined in the test file, and associating it with a suite
3.  Calling `intern.executor.register` to register all of the suites generated by the test interface with the test executor

`intern.executor.register` takes a callback that will be called by the executor. The callback will be passed a Suite object that it should register tests on. For unit tests, the callback will normally be called only once. For functional tests, the callback will be called once for each remote environment.

There are two ways to write test interfaces: as standard modules, or as loader plug-ins.

### As a standard module (for tests written in JavaScript)

A standard module is a normal AMD module that returns a test interface.

A very basic custom interface that lets users register test functions by calling `addTest` looks like this:

    // in tests/support/customInterface.js
    define(function (require) {
      var intern = require('intern');
      var Test = require('intern/lib/Test');

      return {
        // Whenever `addTest` is called on this interface…
        addTest: function (name, testFn) {
          // …the test function is registered on each of the root
          // suites defined by the test executor
          intern.executor.register(function (suite) {
            // The interface is responsible for creating a Test object
            // representing the test function and associating it with
            // the correct parent suite
            var test = new Test({ name: name, test: testFn, parent: suite });
            suite.tests.push(test);
          });
        }
      };

      // That’s it!
    });

This custom interface can then be used by any test module simply by requiring and using it the same way you’d use one of the built-in test interfaces:

    // in tests/unit/test.js
    define(function (require) {
      var interface = require('../support/customInterface');
      var assert = require('intern/chai!assert');

      interface.addTest('my test', function () {
        assert.ok(true);
      });
    });

Interfaces can also create nested suites by creating Suite objects:

    // in tests/support/suiteInterface.js
    define(function (require) {
      var intern = require('intern');
      var Suite = require('intern/lib/Suite');
      var Test = require('intern/lib/Test');

      return {
        // Whenever `createSuite` is called on this interface…
        createSuite: function (name) {
          var suites = [];

          // …one or more new suites are created and registered
          // with each of the root suites from the executor…
          intern.executor.register(function (rootSuite) {
            var suite = new Suite({ name: name, parent: rootSuite });

            // (Sub-suites are pushed to the `tests` array of their
            // parent suite, same as tests)
            rootSuite.tests.push(suite);

            suites.push(suite);
          });

          // …and a new object is returned that allows test functions
          // to be added to the newly created suite(s)
          return {
            addTest: function (name, testFn) {
              suites.forEach(function (suite) {
                var test = new Test({ name: name, test: testFn, parent: suite });
                suite.tests.push(test);
              });
            }
          };
        }
      };
    });

This custom interface would then be used like this:

    // in tests/unit/test2.js
    define(function (require) {
      var interface = require('../support/suiteInterface');
      var assert = require('intern/chai!assert');

      var suite = interface.createSuite('my suite');
      suite.addTest('my test', function () {
        assert.ok(true);
      });
    });

Test and Suite constructors must always be passed `name` and `parent` properties, since this information is used at construction time to notify reporters of a new suite or test.

As a more practical (but incomplete) example, to convert a Jasmine test suite to an Intern test suite using a custom Jasmine interface, you’d simply run a script to wrap all of your existing Jasmine spec files like this:

    // in tests/unit/jasmineTest.js
    define(function (require) {
      var jasmine = require('../support/jasmineInterface');

      // you could also just use `with (jasmine) {}` if you want
      var describe = jasmine.describe, it = jasmine.it, expect = jasmine.expect, beforeEach = jasmine.beforeEach, afterEach = jasmine.afterEach, xdescribe = jasmine.xdescribe, xit = jasmine.xit, fdescribe = jasmine.fdescribe, fit = jasmine.fit;

      // existing test code goes here
    });

Then, you’d only need to write a custom Jasmine test interface that creates Intern Suite and Test objects and registers them with the current executor. In this case, since the Jasmine API is so similar to Intern’s TDD API, it’s possible to leverage one of the built-in interfaces instead of having to do it all ourselves:

    // in tests/support/jasmineInterface.js
    define(function (require) {
      var tdd = require('intern!tdd');

      // This function creates an object that looks like a Jasmine Suite and
      // translates back to the native Intern Suite object type
      function createJasmineCompatibleSuite(suite) {
        return {
          disable: function () {
            suite.tests.forEach(function (test) {
              test.skip('Disabled');
            });
          },
          getFullName: function () {
            return suite.id;
          },
          // …
        };
      }

      // This function creates an object that looks like a Jasmine spec and
      // translates back to the native Intern Test object type
      function createJasmineCompatibleSpec(test) {
        return {
          disable: function () {
            test.skip('Disabled');
          },
          status: function () {
            if (test.skipped != null) {
              return 'disabled';
            }

            if (test.timeElapsed == null) {
              return 'pending';
            }

            if (test.error) {
              return 'failed';
            }

            return 'passed';
          },
          // …
        };
      }

      // This function wraps a Jasmine suite factory so that when it is invoked
      // it gets a `this` context that looks like a Jasmine suite
      function wrapJasmineSuiteFactory(factory) {
        return function () {
          var jasmineSuite = createJasmineCompatibleSuite(this);
          factory.call(jasmineSuite);
        };
      }

      // This function wraps a Jasmine spec so when it is invoked it gets a
      // `this` context that looks like a Jasmine spec and supports Jasmine’s
      // async API
      function wrapJasmineTest(test) {
        return function () {
          var jasmineTest = createJasmineCompatibleSpec(test);
          if (test.length === 1) {
            return new Promise(function (resolve) {
              test.call(jasmineTest, resolve);
            });
          }
          else {
            test.call(jasmineTest);
          }
        };
      }

      return {
        // When `describe` is called on the Jasmine interface…
        describe: function (name, factory) {
          // …route it through to Intern, wrapping the factory as needed
          // so it will work correctly in Intern
          tdd.suite(name, wrapJasmineSuiteFactory(factory));
        },

        // When `it` is called on the Jasmine interface…
        it: function (name, spec) {
          // …route it through to Intern, wrapping the test function
          // so it will work correctly in Intern
          tdd.test(name, wrapJasmineTest(spec));
        },

        // continue to translate the Jasmine API until tests run…

        // …
      };
    });

The [built-in interfaces](https://github.com/theintern/intern/tree/3.4/lib/interfaces) can also be used as a reference to understand how to better create a custom interface.

### As a loader plugin (for tests written in other languages)

For tests written in other languages, an AMD [loader plugin](https://github.com/amdjs/amdjs-api/blob/master/LoaderPlugins.md) can be used instead of a normal module to asynchronously parse and compile the foreign source code into a JavaScript function that can be called by an Intern Test object:

    // in tests/support/javaInterface.js
    define(function () {
      var text = require('intern/dojo/text');
      var parser = require('tests/support/javaTestParser');
      var intern = require('intern');
      var Test = require('intern/lib/Test');

      // Return an AMD loader plugin…
      return {
        // When the plugin is requested as a dependency…
        load: function (resourceId, require, load) {
          // …load the associated resource ID…
          text.load(resourceId, function (code) {
            // …then use a parser to convert the raw test code into
            // a list of test names and functions…
            var tests = parser.parse(code);

            // …then register each test function with Intern…
            tests.forEach(function (testNode) {
              intern.executor.register(function (suite) {
                var test = new Test({
                  name: testNode.name,
                  test: testNode.fn,
                  parent: suite
                });
                suite.tests.push(test);
              });
            });

            // …then tell the module loader that the everything is done loading
            load();
          });
        }
      };
    });

To use a plugin-based test interface like this, use the AMD loader plugin syntax in your Intern configuration:

    // in intern.js
    define({
      suites: [
        // load `tests/unit/test.java` using `tests/support/javaInterface`
        'tests/support/javaInterface!tests/unit/test.java'
      ],
      functionalSuites: [
        // load `tests/functional/test.java` using `tests/support/javaInterface`
        'tests/support/javaInterface!tests/functional/test.java'
      ]
    });

## Custom executors <span class="versionBadge">3.0</span>

TODO

## Custom reporters

If none of the [built-in reporters](https://theintern.github.io/intern/#reporter-overview) provide the information you need, you can write a custom reporter and reference it using an absolute module ID (i.e. `'tests/support/CustomReporter'`).

<span class="versionBadge">3.0</span> Reporters in Intern are JavaScript constructors. When instantiated, a reporter receives the configuration data provided by the user in their [reporters](https://theintern.github.io/intern/#option-reporters) configuration, along with the following special properties:

| Property | Description                                                                                                                                                                                                                      |
|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| console  | An object that provides the basic [Console API](https://developer.mozilla.org/en-US/docs/Web/API/console) for reporters that want to provide enhanced console-based output.                                                      |
| output   | A Writable stream where output data should be sent by calling `output.write(data)`. This stream will automatically be closed by Intern at the end of the test run. Most reporters should use this mechanism for outputting data. |

Reporters should implement one or more of the following methods, which will be called by Intern when an event occurs:

<table>
<thead>
<tr class="header">
<th>Method</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>coverage(<br />
  sessionId: string,<br />
  data: Object<br />
)</td>
<td>This method is called when code coverage data has been retrieved from an environment. This will occur once per remote environment when all unit tests have completed, and again any time a new page is loaded. Each unique <code>sessionId</code> corresponds to a single remote environment. <code>sessionId</code> will be <code>null</code> for a local environment (for example, in the Node.js client).</td>
</tr>
<tr class="even">
<td>deprecated(<br />
  name: string,<br />
  replacement?: string,<br />
  extra?: string<br />
)</td>
<td>This method is called when a deprecated function is called.</td>
</tr>
<tr class="odd">
<td>fatalError(error: Error)</td>
<td>This method is called when an error occurs within the test system that is non-recoverable (for example, a bug within Intern).</td>
</tr>
<tr class="even">
<td>newSuite(suite: Suite)</td>
<td>This method is called when a new test suite is created.</td>
</tr>
<tr class="odd">
<td>newTest(test: Test)</td>
<td>This method is called when a new test is created.</td>
</tr>
<tr class="even">
<td>proxyEnd(config: Proxy)</td>
<td>This method is called once the built-in HTTP server has finished shutting down.</td>
</tr>
<tr class="odd">
<td>proxyStart(config: Proxy)</td>
<td>This method is called once the built-in HTTP server has finished starting up.</td>
</tr>
<tr class="even">
<td>reporterError(<br />
  reporter: Reporter,<br />
  error: Error<br />
)</td>
<td>This method is called when a reporter throws an error during execution of a command. If a reporter throws an error in response to a <code>reporterError</code> call, it will not be called again to avoid infinite recursion.</td>
</tr>
<tr class="odd">
<td>runEnd(executor: Executor)</td>
<td>This method is called after all test suites have finished running and the test system is preparing to shut down.</td>
</tr>
<tr class="even">
<td>runStart(executor: Executor)</td>
<td>This method is called after all tests have been registered and the test system is about to begin running tests.</td>
</tr>
<tr class="odd">
<td>suiteEnd(suite: Suite)</td>
<td>This method is called when a test suite has finished running.</td>
</tr>
<tr class="even">
<td>suiteError(<br />
  suite: Suite,<br />
  error: Error<br />
)</td>
<td>This method is called when an error occurs within one of the suite’s lifecycle methods (setup, beforeEach, afterEach, or teardown), or when an error occurs when a suite attempts to run a child test.</td>
</tr>
<tr class="odd">
<td>suiteStart(suite: Suite)</td>
<td>This method is called when a test suite starts running.</td>
</tr>
<tr class="even">
<td>testEnd(test: Test)</td>
<td>This method is called when a test has finished running.</td>
</tr>
<tr class="odd">
<td>testFail(test: Test)</td>
<td>This method is called when a test has failed.</td>
</tr>
<tr class="even">
<td>testPass(test: Test)</td>
<td>This method is called when a test has passed.</td>
</tr>
<tr class="odd">
<td>testSkip(test: Test)</td>
<td>This method is called when a test has been skipped.</td>
</tr>
<tr class="even">
<td>testStart(test: Test)</td>
<td>This method is called when a test starts running.</td>
</tr>
<tr class="odd">
<td>tunnelDownloadProgress(<br />
  tunnel: Tunnel,<br />
  progress: Object<br />
)</td>
<td>This method is called every time a tunnel download has progressed. The <code>progress</code> object contains <code>loaded</code> (bytes received) and <code>total</code> (bytes to download) properties.</td>
</tr>
<tr class="even">
<td>tunnelEnd(tunnel: Tunnel)</td>
<td>This method is called after the WebDriver server tunnel has shut down.</td>
</tr>
<tr class="odd">
<td>tunnelStart(tunnel: Tunnel)</td>
<td>This method is called immediately before the WebDriver server tunnel is started.</td>
</tr>
<tr class="even">
<td>tunnelStatus(<br />
  tunnel: Tunnel,<br />
  status: string<br />
)</td>
<td>This method is called whenever the WebDriver server tunnel reports a status change.</td>
</tr>
</tbody>
</table>

A reporter can return a Promise from any of these methods, which will cause the test system to pause at that point until the Promise has been resolved. The behaviour of a rejected reporter Promise is currently undefined.

For backwards-compatibility, you can also create reporters using the deprecated Intern 2 format, where the reporter itself is a single JavaScript object that uses topic names as keys and functions as values:

    define(function (require) {
      return {
        '/test/start': function (test) {
          console.log(test.id + ' started');
        },
        '/test/end': function (test) {
          console.log(test.id + ' ended');
        }
      };
    });

Legacy reporters can also include optional `start` and `stop` methods for performing any additional arbitrary work when a reporter is started or stopped:

    define(function (require) {
      var aspect = require('dojo/aspect');
      var Suite = require('intern/lib/Suite');

      var handles = [];
      return {
        start: function () {
          function augmentJsonValue() {
            /* … */
          }

          handles.push(aspect.after(Suite.prototype, 'toJSON', augmentJsonValue));
        },

        stop: function () {
          var handle;
          while ((handle = handles.pop())) {
            handle.remove();
          }
        }
      }
    });

Events from the list above will be converted to topics for legacy reporters as follows:

<table>
<thead>
<tr class="header">
<th>Event</th>
<th>Topic</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>coverage</td>
<td>/coverage</td>
</tr>
<tr class="even">
<td>deprecated</td>
<td>/deprecated</td>
</tr>
<tr class="odd">
<td>fatalError</td>
<td>/error</td>
</tr>
<tr class="even">
<td>newSuite</td>
<td>/suite/new</td>
</tr>
<tr class="odd">
<td>newTest</td>
<td>/test/new</td>
</tr>
<tr class="even">
<td>runEnd</td>
<td>/client/end<br />
/runner/end<br />
stop (method)</td>
</tr>
<tr class="odd">
<td>runStart</td>
<td>/runner/start<br />
start (method)</td>
</tr>
<tr class="even">
<td>suiteEnd</td>
<td>/suite/end</td>
</tr>
<tr class="odd">
<td>suiteError</td>
<td>/suite/error</td>
</tr>
<tr class="even">
<td>suiteStart</td>
<td>/suite/start</td>
</tr>
<tr class="odd">
<td>testEnd</td>
<td>/test/end</td>
</tr>
<tr class="even">
<td>testFail</td>
<td>/test/fail</td>
</tr>
<tr class="odd">
<td>testPass</td>
<td>/test/pass</td>
</tr>
<tr class="even">
<td>testSkip</td>
<td>/test/skip</td>
</tr>
<tr class="odd">
<td>testStart</td>
<td>/test/start</td>
</tr>
<tr class="even">
<td>testFail</td>
<td>/test/fail</td>
</tr>
<tr class="odd">
<td>tunnelDownloadProgress</td>
<td>/tunnel/download/progress</td>
</tr>
<tr class="even">
<td>tunnelEnd</td>
<td>/tunnel/stop</td>
</tr>
<tr class="odd">
<td>tunnelStart</td>
<td>/tunnel/start</td>
</tr>
<tr class="even">
<td>tunnelStatus</td>
<td>/tunnel/status</td>
</tr>
</tbody>
</table>
