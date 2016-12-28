'use babel'

import Path from 'path'
import {
    CompositeDisposable
} from 'atom'

type Linter$Provider = Object

module.exports = {
    config: {
        jslintVersion: {
            type: 'string',
            default: 'latest',
            enum: ['latest', 'es6', 'es5', '2016-07-13', '2016-05-13', '2015-05-08', '2014-07-08', '2014-04-21', '2014-02-06', '2014-01-26', '2013-11-23', '2013-09-22', '2013-08-26', '2013-08-13', '2013-02-03', '2012-02-03'],
            description: 'JSLint version'
        },
        lintInlineJavaScript: {
            type: 'boolean',
            default: false,
            description: 'Lint JavaScript inside `<script>` blocks in files.'
        },
        disableWhenNoJslintrcFileInPath: {
            type: 'boolean',
            default: false,
            description: 'Disable linter when no `.jslintrc` is found in project.'
        },
        jslintFileName: {
            type: 'string',
            default: '.jslintrc',
            description: 'JSLint file name'
        }
    },

    activate() {
        require('atom-package-deps').install('linter-jslint');

        this.scopes = ['source.js', 'source.js-semantic']
        this.subscriptions = new CompositeDisposable()
        this.subscriptions.add(
            atom.config.observe('linter-jslint.jslintVersion',
                jslintVersion => {
                    this.jslintVersion = jslintVersion
                }
            )
        )
        this.subscriptions.add(
            atom.config.observe('linter-jslint.disableWhenNoJslintrcFileInPath',
                disableWhenNoJslintrcFileInPath => {
                    this.disableWhenNoJslintrcFileInPath = disableWhenNoJslintrcFileInPath
                }
            )
        )
        this.subscriptions.add(
            atom.config.observe('linter-jslint.jslintFileName',
                jslintFileName => {
                    this.jslintFileName = jslintFileName
                }
            )
        )

        const scopeEmbedded = 'source.js.embedded.html'
        this.subscriptions.add(
            atom.config.observe('linter-jslint.lintInlineJavaScript',
                lintInlineJavaScript => {
                    this.lintInlineJavaScript = lintInlineJavaScript
                    if (lintInlineJavaScript) {
                        this.scopes.push(scopeEmbedded);
                    } else if (this.scopes.indexOf(scopeEmbedded) !== -1) {
                        this.scopes.splice(this.scopes.indexOf(scopeEmbedded), 1)
                    }
                }
            )
        )
    },

    deactivate() {
        this.subscriptions.dispose();
    },

    provideLinter(): Linter$Provider {
        const fs = require("fs")
        const Helpers = require('atom-linter')
        var that = this
            //const Reporter = require('jshint-json')

        return {
            name: 'JSLint',
            grammarScopes: that.scopes,
            scope: 'file',
            lintOnFly: true,
            lint: async(textEditor) => {
                var jslintConfig = {},
                    jsLint = require('jslint').load(that.jslintVersion),
                    jsLinter = require('jslint').linter.doLint
                const results = []
                const warnings = [
                    'unused_a',
                    'empty_block'
                ]
                const infos = [
                    'nested_comment',
                    'todo_comment',
                    'too_long'
                ]
                const filePath = textEditor.getPath()
                const fileContents = textEditor.getText()
                    //const parameters = ['--reporter', Reporter, '--filename', filePath]

                // Read JSLint configuration
                const globalConfigFile = Path.join(process.env.HOME || process.env.HOMEPATH, that.jslintFileName);
                if (globalConfigFile) {
                    try {
                        Object.assign(jslintConfig, JSON.parse(fs.readFileSync(globalConfigFile, 'utf-8')));
                    } catch (error) {
                        if (error.code !== 'ENOENT') {
                            console.log('Error skipping global config file "' + globalConfigFile + '": ' + error)
                        }
                    }
                }
                const configFile = await Helpers.findCachedAsync(
                    Path.dirname(filePath), that.jslintFileName
                )
                if (configFile) {
                    try {
                        Object.assign(jslintConfig, JSON.parse(fs.readFileSync(configFile, 'utf-8')));
                    } catch (error) {
                        if (error.code !== 'ENOENT') {
                            console.log('Error skipping project config file "' + configFile + '": ' + error)
                        }
                    }
                } else if (that.disableWhenNoJslintrcFileInPath) {
                    return results
                }

                // if (that.lintInlineJavaScript &&
                //   textEditor.getGrammar().scopeName.indexOf('text.html') !== -1
                // ) {
                //   parameters.push('--extract', 'always')
                // }
                // parameters.push('-')

                const result = jsLinter(jsLint, fileContents, jslintConfig)
                if (!result || !result.errors.length) {
                    return results
                }
                for (index in result.errors) {
                    var entry = result.errors[index];
                    if (!entry) {
                        continue
                    }
                    var message = entry.message ? entry.message : entry.reason
                    column = entry.column ? entry.column : entry.character
                    line = entry.line
                        // pointStart = [entry.line, column]
                        // pointEnd = [entry.line, column + message.length]

                    // Padding for jslint.edition > 2014
                    if (that.jslintVersion.match(/^201[0-4]/)) {
                        line -= 1;
                        column -= 1;
                        // pointStart = [pointStart[0] - 1, pointStart[1] - 1]
                        // pointEnd = [pointEnd[0] - 1, pointEnd[1] - 1]
                        if (entry.raw == "Expected '{a}' at column {b}, not column {c}.") {
                            message = entry.raw
                                .replace("{a}", entry.a)
                                .replace("{b}", entry.b - 1)
                                .replace("{c}", entry.c - 1)
                                .replace("{d}", entry.d)
                        }
                    }

                    if (infos.indexOf(entry.code) >= 0) {
                        type = 'Info'
                    } else if (warnings.indexOf(entry.code) >= 0) {
                        type = 'Warning'
                    } else {
                        type = 'Error'
                    }
                    results.push({
                        type: type,
                        html: `<a href="https://jslinterrors.com/${entry.code}">${entry.code}</a> - ${message}`,
                        filePath,
                        range: Helpers.rangeFromLineNumber(textEditor, line, column)
                    })
                }
                return results;
            }
        }
    }
}
