const fs = require('fs');
const assert = require('assert');
const generator = require('../lib/enumeration');
const strategies = ['complete', 'shuffle', 'random'];
const specs = [
  require('../resources/specs/java/util/concurrent/ConcurrentHashMap.json'),
  require('../resources/specs/java/util/concurrent/ConcurrentLinkedDeque.json')
];

describe('generate()', function() {
  for (let e of strategies) {
    describe(`${e} enumeration`, function() {
      for (let spec of specs) {
        const schemaGenerator = generator({
          enum: e,
          spec: spec,
          method: 'clear',
          values: 2,
          sequences: 2,
          invocations: 3
        });

        const tests = [
          [0,0,0].map(_ => schemaGenerator.next().value)
        ];

        for (let schemas of tests) {
          it(`generates ${schemas.length} schemas for ${spec.class.split('.').pop()}`, function() {
            assert.ok(schemas.every(s => s.sequences.length === 2));
          });
        }
      }
    });
  }
});
