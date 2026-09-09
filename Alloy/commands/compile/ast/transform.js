/*
	The AST pipeline Alloy runs over generated JS: parse, apply the builtins and
	optimizer visitors, print.

	This used to go through @babel/core, which was only ever acting as a plugin
	runner -- it re-parsed code sourceMapper.js had already parsed, deep-cloned
	the AST defensively, and resolved a babel config that never exists in a
	Titanium project. Driving @babel/traverse and @babel/generator directly does
	the same work without any of that.
*/
var parser = require('@babel/parser'),
	traverseModule = require('@babel/traverse'),
	generate = require('@babel/generator').default,
	_ = require('lodash'),
	CONST = require('../../../common/constants'),
	builtinsVisitor = require('./builtins-plugin'),
	optimizerVisitor = require('./optimizer-plugin');

var traverse = traverseModule.default;

// Every identifier the optimizer visitor can fold, built from the same
// constants it builds its defines from, plus the two member expressions it
// rewrites. A file containing none of these cannot be changed by it.
var OPTIMIZE_RX = new RegExp(
	'\\b(?:' + []
		.concat(_.map(CONST.DEPLOY_TYPES, 'key'))
		.concat(_.map(CONST.DIST_TYPES, 'key'))
		.concat(_.map(CONST.PLATFORMS, function(p) { return 'OS_' + p.toUpperCase(); }))
		.join('|') + ')\\b'
	+ '|Ti(?:tanium)?\\.Platform\\.(?:os)?name'
);

// What the builtins visitor looks for: require('alloy/x') or require('/alloy/x').
var ALLOY_REQUIRE_RX = /require\s*\(\s*['"]\/?alloy\//;

// @babel/core stripped a trailing sourceMappingURL comment as part of picking up
// an input source map that nothing here consumes. @babel/generator has no such
// behaviour, so strip it ourselves to keep the output identical. Alloy appends
// this comment in sourceMapper.js after the transform, so the only files that
// arrive carrying one are those written on a previous build.
var SOURCE_MAP_COMMENT = /\n?\/\/# sourceMappingURL=[^\n]*$/;

/*
 * @method createVisitor
 * Builds the merged visitor used by both call sites. Merging means one
 * traversal rather than one per plugin, which is what @babel/core did too.
 *
 * @param {Object} compileConfig Alloy's compile config, for the builtins visitor
 * @param {Object} alloyConfig The alloyConfig (platform/deploytype/target), for the optimizer
 * @return {Object} A @babel/traverse visitor
 */
exports.createVisitor = function(compileConfig, alloyConfig) {
	return traverseModule.visitors.merge([
		builtinsVisitor(compileConfig),
		optimizerVisitor(alloyConfig)
	]);
};

/*
 * @method createBuiltinsVisitor
 * The builtins visitor on its own. It only reads the AST -- it copies builtin
 * modules into Resources as a side effect -- so a file that needs this but not
 * the optimizer can be scanned without ever being printed or rewritten.
 */
exports.createBuiltinsVisitor = function(compileConfig) {
	return builtinsVisitor(compileConfig);
};

/*
 * @method needsOptimize
 * True if the optimizer visitor could change this code. Deliberately
 * over-inclusive: a define name inside a comment or string costs one needless
 * parse, which is what every file costs today.
 */
exports.needsOptimize = function(code) {
	return OPTIMIZE_RX.test(code);
};

/*
 * @method hasAlloyRequire
 * True if the builtins visitor could find something to copy in this code.
 */
exports.hasAlloyRequire = function(code) {
	return ALLOY_REQUIRE_RX.test(code);
};

/*
 * @method parse
 * Parses code with the options Alloy needs. Throws on a syntax error; callers
 * report it with U.dieWithCodeFrame().
 */
exports.parse = function(code, filename) {
	return parser.parse(code, {
		sourceFilename: filename,
		sourceType: 'unambiguous',
		allowReturnOutsideFunction: true
	});
};

/*
 * @method stripSourceMapComment
 * Removes a trailing //# sourceMappingURL= comment, as @babel/core did.
 */
exports.stripSourceMapComment = function(code) {
	return code.replace(SOURCE_MAP_COMMENT, '');
};

/*
 * @method run
 * Applies the visitor to the AST in place and prints it.
 *
 * @param {Object} ast The AST to transform, mutated in place
 * @param {String} code The original source, used by the generator
 * @param {Object} visitor A visitor from createVisitor()
 * @param {Object} options sourceMapper.OPTIONS_OUTPUT, or a clone of it
 * @return {String} The generated code
 */
exports.run = function(ast, code, visitor, options) {
	traverse(ast, visitor);
	return generate(ast, options, code).code;
};

/*
 * @method traverse
 * Applies a visitor without printing, for the scan-only case.
 */
exports.traverse = function(ast, visitor) {
	traverse(ast, visitor);
};
