var _ = require('lodash');

exports.parse = function (node, state) {
	_.extend(state, {
		itemsArray: 'windowToolbar',
		property: 'toolbar',
		itemArrayDefinition: {
			parents: [
				'Ti.UI.Window'
			],
			children: [
				'ALL'
			]
		}
	});
	return require('./Alloy.Abstract._ItemArray').parse(node, state);
};
