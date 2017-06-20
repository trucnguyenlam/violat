var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var records = require('./records.js')('---\n');

var config = require('./config.js');

async function translate(schemaFile, id) {
    let dstFiles = [];
    let dstPath = path.join(config.outputPath, 'harnesses');
    for (let schema of await records.get(fs.createReadStream(schemaFile))) {
        let className = `${schema.class}${id}Test${schema.id}`;
        let packagePath = schema.class;
        let dstFile = path.resolve(dstPath, packagePath, `${className}.${schema.language}`);
        mkdirp.sync(path.dirname(dstFile));
        fs.writeFileSync(dstFile, schemaToHarness(schema, className));
        dstFiles.push({
            absolutePath: dstFile,
            relativePath: `${packagePath}/${className}.${schema.language}`
        });
    }
    return dstFiles;
}

function getInitialSequence(schema) {
    let minimals = schema.sequences.map(s => s.index)
        .filter(i => schema.order.every(([_, j]) => i != j));
    return minimals.length == 1 ? minimals[0] : undefined;
}

function getFinalSequence(schema) {
    let maximals = schema.sequences.map(s => s.index)
        .filter(i => schema.order.every(([j, _]) => i != j));
    return maximals.length == 1 ? maximals[0] : undefined;
}

function isLegal(schema) {
    let initial = getInitialSequence(schema);
    let final = getFinalSequence(schema);
    return schema.sequences.map(s => s.index).every(i => {
        let predecessors = schema.order.filter(([_, j]) => j == i).map(([j, _]) => j);
        let successors = schema.order.filter(([j, _]) => j == i).map(([_, j]) => j);
        return i == initial || i == final || (
            predecessors.filter(j => j != initial).length == 0 &&
            successors.filter(j => j != final).length == 0
        );
    });
}

function escape(outcome) {
    return outcome.replace(/([\[\]\{\}])/g, '\\\\$1');
}

function addOutcome(harnessCode, outcome) {
    return harnessCode.replace(/^(?=@State)/m,
        `@Outcome(id = "${escape(outcome)}", expect = Expect.ACCEPTABLE_INTERESTING)\n`
    );
}

function schemaToHarness(schema, testName) {
    if (!isLegal(schema)) {
        throw new Error(`Unable to translate schema:\n${JSON.stringify(schema)}`);
    }

    let className = schema.class;

    /**
     * initial: run before thread creation
     * final: run after thread finish
     */
    let initial = getInitialSequence(schema); 
    let final = getFinalSequence(schema);

    let hasResult = (seq, inv) => seq.index != initial && !inv.void;
    let numResults = schema.sequences
        .map(s => s.invocations.filter(i => hasResult(s, i)).length)
        .reduce((x, y) => x + y, 0);

    let resultType = "int";

    let resultIdxs = schema.sequences
        .reduce((xs, s) => xs.concat(s.invocations.map(v => ({
            seq: s,
            inv: v
        }))), [])
        .map((x, i) => Object.assign({}, x, {
            idx: i
        }))
        .filter(x => hasResult(x.seq, x.inv))
        .map(x => x.idx);

    let actorIdx = 0;
    let resultIdx = 0;

    function invocation(i) {
        return `G_OBJ.${i.method}(${i.arguments.map(x => {
      if (Array.isArray(x))
        return `Arrays.asList(${x.join(', ')})`;
      else if (Object.keys(x).length > 0)
        return `Collections.unmodifiableMap(Stream.of(${Object.keys(x).map(k => `new AbstractMap.SimpleEntry<>(${k},${x[k]})`).join(', ')}).collect(Collectors.toMap(e -> e.getKey(), e -> e.getValue())))`;
      else
        return x;
    }).join(',')})`;
    }

    // variables for 
    let resultDeclIdx = 0;
    let resultRecordIdx = 0;
    let threadDeclIdx = 0;
    let threadMainDeclIdx = 0;
    let threadMainInitialIdx = 0;
    let threadMainCreationIdx = 0;
    let threadMainJoinIdx = 0;

    return `#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <pthread.h>

/* STORE RESULTS, GLOBAL VARIABLES */
${className} G_OBJ;
${schema.sequences.map(s => {
    return `${s.invocations.map(i => {
        let v = invocation(i);
        return `${hasResult(s, i) ? `int RESULT_${resultDeclIdx++};` : ``}`;
    }).join('\n')}`
}).join('\n')}

/* LIBRARY FILE, IF ONE FILE ONLY */


/* THREADS */
${schema.sequences.map(s => {
    let signature = `void *thread${threadDeclIdx++}(void * args)`;
    return `
${signature} {
    ${s.invocations.map(i => {
        let v = invocation(i);
        return `${hasResult(s, i) ? `RESULT_${resultRecordIdx++} = ${v}` : `${v}`};`;
    }).join('\n    ')}
    return 0;
}        
`; 
}).join('\n')}

/* MAIN DRIVER */
int main(int argc, char* argv[]) {
    /* Init data structure */
    
    /* Thread declaration */
    pthread_t ${schema.sequences.map(s => {
        let signature;
        if (s.index == initial) {
             signature = ``;
             threadMainDeclIdx++;
        }
        else if (s.index == final) {
            signature = ``;
            threadMainDeclIdx++;
        }
        else {
            signature = `t${threadMainDeclIdx++}`
        }
        return `${signature}`;
    }).join(', ')};
    
    /* Initial thread (launch in main) */
${schema.sequences.map(s => {
        let signature;
        if (s.index == initial) {
             signature = `thread${threadMainInitialIdx++}();`;
        }
        else if (s.index == final) {
            signature = ``;
            threadMainInitialIdx++;
        }
        else {
            signature = ``;
            threadMainInitialIdx++;
        }
        return `    ${signature}`;
    }).join('')}

    /* Thread creation */
${schema.sequences.map(s => {
        let signature;
        if (s.index == initial) {
             signature = ``;
             threadMainCreationIdx++;
        }
        else if (s.index == final) {
            signature = ``;
            threadMainCreationIdx++;
        }
        else {
            signature = `pthread_create(&t${threadMainCreationIdx++}, 0, thread${threadMainCreationIdx}, 0);`;
        }
        return `    ${signature}`;
    }).join('\n')}

    /* Wait for threads to finish */
${schema.sequences.map(s => {
        let signature;
        if (s.index == initial) {
             signature = ``;
             threadMainJoinIdx++;
        }
        else if (s.index == final) {
            signature = ``;
            threadMainJoinIdx++;
        }
        else {
            signature = `pthread_join(t${threadMainJoinIdx++}, 0);`;
        }
        return `    ${signature}`;
    }).join('\n')}

    /* Final thread (launch in main) */
${schema.sequences.map(s => {
        let signature;
        if (s.index == initial) {
            signature = ``;
            threadMainInitialIdx++;
        }
        else if (s.index == final) {
            signature = `thread${threadMainInitialIdx++}`;
        }
        else {
            signature = ``;
            threadMainInitialIdx++;
        }
        return `    ${signature}`;
    }).join('')}

    /* Check results */
    assert(
${schema.outcomes.map(outcome => {
    let filtered = outcome.map( (r, i) => {
        if (resultIdxs.includes(i)){
            // Filter exeption, every exception is 
            let result = r;
            if (result.match('Exception')) {
                result = 'EMPTY';
            }
            return `RESULT_${i} == ${result}`;
        }
        else {
            return null;
        }
    }).filter( s => s ).join(' && ');
    return `(${filtered})`;
}).join(' ||\n')}
    );

    return 0;
}
`;
}

exports.translate = translate;
exports.addOutcome = addOutcome;

if (require.main === module) {
    console.log(schemaToHarness(JSON.parse(fs.readFileSync(process.argv[2])), 'Test'));
}