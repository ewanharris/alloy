exports.definition = {
	extendModel: function (Model) {
		_.extend(Model.prototype, {
			transform: function () {
				var transformed = this.toJSON();

				transformed.foo += 'D!';
				transformed.bar += 'T!';

				return transformed;
			}
		});

		return Model;
	}
};
