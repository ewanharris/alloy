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
	builtinsVisitor = require('./builtins-plugin'),
	optimizerVisitor = require('./optimizer-plugin');

var traverse = traverseModule.default;

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
