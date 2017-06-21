#!/usr/bin/env node
"use strict";

let fs = require('fs');
let path = require('path');
let meow = require('meow');
let checker = require(path.join(__dirname, '../lib', 'index.js'));
let meta = require('../package.json');

let cli = meow(`
  Usage
    $ ${meta.name} --spec <spec-file.json>

  Options
    --spec <spec-file.json>       Java class specification file (required).
    --method <method-name>        Name of a method to test.
    --values N                    Number of distinct argument values.
    --sequences N                 Number of concurrent invocation sequences.
    --invocations N               Total number of invocations.

  C/CPP Languages
    --clang                       Enable C/C++ Language.
    --lib-file <lib-file.cxx>     Input library file (1 file only)

  Examples
    $ ${meta.name} --spec ConcurrentSkipListMap.json --method clear --sequences 2 --invocations 4
`, {
  default: {
  }
});

if (!cli.flags.spec) {
  cli.showHelp();
}

(async () => {
  console.log(`${meta.name} version ${meta.version}`);
  console.log(`---`);
  console.log(`class: ${JSON.parse(fs.readFileSync(cli.flags.spec)).class}`);
  console.log(`---`);

  let results = cli.flags.method
    ? await checker.testMethod(cli.flags)
    : await checker.testUntrustedMethods(cli.flags);

  for (let result of ([].concat(results))) {
    for (let res of result.results) {
      console.log(`Violation discovered in the following harness.`);
      console.log(`---`);
      console.log(res.harnessCode);
      console.log(`---`);
      for (let r of res.forbiddenResults)
        console.log(`${r.count} of ${res.numExecutions} executions gave outcome: ${r.outcome}`);
      console.log(`---`);
    }
  }
})();
