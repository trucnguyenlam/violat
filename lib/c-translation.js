const debug = require('debug')('translation');

var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');

var config = require('./config.js');

module.exports = function(schemas, method, includefile){
  debug(`translating ${schemas.length} schemas`);
  let dstFiles = [];
  let dstPath = path.join(config.outputPath, 'harnesses');
  schemas.forEach(schema => {
        let className = `${schema.class}${method}Test${schema.id}`;
        let packagePath = schema.class;
        let dstFile = path.resolve(dstPath, packagePath, `${className}.${schema.language}`);
        mkdirp.sync(path.dirname(dstFile));
        fs.writeFileSync(dstFile, schemaToHarness(schema, className, includefile));
        dstFiles.push({
            absolutePath: dstFile,
            relativePath: `${packagePath}/${className}.${schema.language}`
        });
  } 
  );
  debug(`translated ${dstFiles.length} schemas`);
  return dstFiles;    
}


// async function translate(schemaFile, method, includefile) {
//     let dstFiles = [];
//     let dstPath = path.join(config.outputPath, 'harnesses');
//     for (let schema of await records.get(fs.createReadStream(schemaFile))) {
//         let className = `${schema.class}${method}Test${schema.id}`;
//         let packagePath = schema.class;
//         let dstFile = path.resolve(dstPath, packagePath, `${className}.${schema.language}`);
//         mkdirp.sync(path.dirname(dstFile));
//         fs.writeFileSync(dstFile, schemaToHarness(schema, className, includefile));
//         dstFiles.push({
//             absolutePath: dstFile,
//             relativePath: `${packagePath}/${className}.${schema.language}`
//         });
//     }
//     return dstFiles;
// }

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

// function addOutcome(harnessCode, outcome) {
//     return harnessCode.replace(/^(?=@State)/m,
//         `@Outcome(id = "${escape(outcome)}", expect = Expect.ACCEPTABLE_INTERESTING)\n`
//     );
// }

function schemaToHarness(schema, testName, includefile) {
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

    function invocation(i, language, object_name) {
        if (language == 'c') {  // C language
            if (object_name) {
                if (i.arguments.length > 0) {
                    return `${i.method}(${object_name}, ${i.arguments.map(x => {
                        if (Array.isArray(x))
                            return `Arrays.asList(${x.join(', ')})`;
                        else if (Object.keys(x).length > 0)
                            return `Collections.unmodifiableMap(Stream.of(${Object.keys(x).map(k => `new AbstractMap.SimpleEntry<>(${k},${x[k]})`).join(', ')}).collect(Collectors.toMap(e -> e.getKey(), e -> e.getValue())))`;
                        else
                            return x;
                    }).join(',')})`;
                } else {
                    return `${i.method}(${object_name})`;
                }
            }else{
                return `${i.method}(${i.arguments.map(x => {
                    if (Array.isArray(x))
                        return `Arrays.asList(${x.join(', ')})`;
                    else if (Object.keys(x).length > 0)
                        return `Collections.unmodifiableMap(Stream.of(${Object.keys(x).map(k => `new AbstractMap.SimpleEntry<>(${k},${x[k]})`).join(', ')}).collect(Collectors.toMap(e -> e.getKey(), e -> e.getValue())))`;
                    else
                        return x;
                }).join(',')})`;
            }
        }else{ // C++ language
            if (object_name) {
                return `${object_name}.${i.method}(${i.arguments.map(x => {
                    if (Array.isArray(x))
                        return `Arrays.asList(${x.join(', ')})`;
                    else if (Object.keys(x).length > 0)
                        return `Collections.unmodifiableMap(Stream.of(${Object.keys(x).map(k => `new AbstractMap.SimpleEntry<>(${k},${x[k]})`).join(', ')}).collect(Collectors.toMap(e -> e.getKey(), e -> e.getValue())))`;
                    else
                        return x;
                }).join(',')})`;
            } else {
                return ``;  // Something wrong happen
            }
        }
    }

    function initExpression(init, language, object_name, init_parameters) {
        if (language == 'c') { // language is C
            if (object_name) { // There is object name
                if (init_parameters.length > 0) {
                    return `${init}(${object_name}, ${init_parameters.join(', ')})`;
                } else {
                    return `${init}(${object_name})`;
                }
            } else {  // There is no object name
                return `${init}(${init_parameters.join(', ')})`;
            }
        } else { // Language is C++
            if (object_name) {
                return `${object_name}.${init}(${init_parameters.join(', ')})`;
            } else {
                return ``; // Something wrong happen
            }
        }
    }


    function resultsDecl(sequences, language, object_name) {
        let rets = [];
        let resultDeclIdx = 0;
        sequences.forEach(s => {
            s.invocations.forEach(i => {
                let v = invocation(i, language, object_name);
                if (hasResult(s, i)){
                    rets.push(`int RESULT_${resultDeclIdx++};`);
                }
                else {
                    resultDeclIdx++;
                    rets.push(``);
                }
            }
            )
        })
        return `${rets.join('\n')}`
    }

    function threadsDecl(sequences, language, object_name){
        let resultRecordIdx = 0;
        let threadDeclIdx = 0;
        let ret = [];

        sequences.forEach(s => {
            let signature = `void *thread${threadDeclIdx++}(void * args)`;
            let stmts = [];
            s.invocations.forEach(i => {
                let v = invocation(i, schema.language, schema.object_name);
                if (hasResult(s, i)){
                    stmts.push(`RESULT_${resultRecordIdx++} = ${v};`);
                }
                else {
                    resultRecordIdx++;
                    stmts.push(`${v};`);
                }
            })
            ret.push(`${signature} {
    ${stmts.join('\n    ')}
}
`);
        })
        return `${ret.join('\n')}`
    }

    let threadMainDeclIdx = 0;
    let threadMainInitialIdx = 0;
    let threadMainCreationIdx = 0;
    let threadMainJoinIdx = 0;

    let includeStr = '';
    if(includefile) {
        includeStr = fs.readFileSync(includefile);
    }

    return `#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <pthread.h>

/* LIBRARY FILE, IF ONE FILE ONLY */
${includeStr}

/* STORE RESULTS, GLOBAL VARIABLES */
${schema.object_name? `${className} ${schema.object_name};`:``} 
${resultsDecl(schema.sequences, schema.language, schema.object_name)}

/* THREADS */
${threadsDecl(schema.sequences, schema.language, schema.object_name)}


/* MAIN DRIVER */
int main(int argc, char* argv[]) {
    /* Init data structure */
    ${initExpression(schema.init, schema.language, schema.object_name, schema.init_parameters)};

    /* Thread declaration */
    ${schema.sequences.map(s => {
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
            signature = `pthread_t t${threadMainDeclIdx++};`
        }
        return `${signature}`;
    }).join('\n    ')}
    
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
            signature = `pthread_create(&t${threadMainCreationIdx++}, 0, thread${threadMainCreationIdx-1}, 0);`;
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
            signature = `thread${threadMainInitialIdx++}();`;
        }
        else {
            signature = ``;
            threadMainInitialIdx++;
        }
        return `    ${signature}`;
    }).join('')}

    /* Check results */
    assert( ${schema.outcomes.map(outcome => {
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
    });
    if (filtered.length > 0) {
        filteredStr = filtered.filter(s => s).join(' && ');
        return `(${filteredStr})`;
    } else {
        return `1`;
    }
}).join(' || ')} );

    return 0;
}
`;
}
