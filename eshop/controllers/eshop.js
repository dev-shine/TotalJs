const PayPal = require('paypal-express-checkout');

exports.install = function() {

	// IMPORTANT:
	// routing is linked with the "sitemap" file

	// PRODUCTS
	F.route('#products',         view_products, ['*Product']);
	F.route('#news',             view_products_news, ['*Product']);
	F.route('#top',              view_products_top, ['*Product']);
	F.route('#category',         view_products_category, ['*Product']);
	F.route('#detail',           view_products_detail, ['*Product']);

	// ORDERS
	F.route('#checkout');
	F.route('#order',            view_checkout, ['*Order']);
	F.route('#payment',          process_payment_paypal, ['*Order']);

	// USER ACCOUNT
	F.route('#account',          view_account, ['authorized', '*Order']);
	F.route('#settings',         'account-settings', ['authorized']);
	F.route('/account/logoff/',  redirect_account_logoff, ['authorized']);
	F.route('#account',          view_login, ['unauthorized']);

	// POSTS
	F.route('#blogs',            view_blogs, ['*Post']);
	F.route('#blogsdetail',      view_blogs_detail, ['*Post']);
};

// ============================================
// PRODUCTS
// ============================================

// Gets products
function view_products() {
	var self = this;
	var options = U.clone(self.query);

	// Total.js monitoring fulltext stats
	self.query.search && MODULE('webcounter').inc('fulltext');

	// DB
	self.$query(options, self.callback('products-all'));
}

// Gets products by category
function view_products_category() {
	var self = this;
	var options = U.clone(self.query);

	options.category = self.req.path.slice(1).join('/');

	var category = F.global.categories.find('linker', options.category);;
	if (!category)
		return self.throw404();

	self.repository.category = category;

	self.$query(options, function(err, data) {

		if (!data.items.length)
			return self.throw404();

		self.repository.subcategories = F.global.categories.where('parent', options.category);
		self.title(category.name);
		self.view('products-category', data);
	});
}

// Gets news products
function view_products_news() {
	var self = this;
	var options = U.clone(self.query);
	options.type = '1';
	self.sitemap('news');
	self.$query(options, self.callback('products-special'));
}

// Gets top products
function view_products_top() {
	var self = this;
	var options = U.clone(self.query);
	options.type = '2';
	self.sitemap('top');
	self.$query(options, self.callback('products-special'));
}

// Gets product detail
function view_products_detail(linker) {
	var self = this;
	var options = {};

	options.linker = linker;

	// Increases the performance (1 minute cache)
	self.$read(options, function(err, data) {

		if (!data || err)
			return self.throw404();

		self.repository.category = F.global.categories.find('linker', data.linker_category);

		if (!self.repository.category)
			return self.throw404();

		self.repository.subcategories = F.global.categories.where('parent', data.linker_category);
		self.repository.linker = linker;
		self.repository.name = data.name;

		// Writes stats
		DB('products').counter.hit(data.id);

		var template = data.template;
		if (template)
			template = '~cms/' + template;
		else
			template = 'products-detail';


		self.title(data.name);
		self.sitemap('detail');
		self.sitemap_change('detail', 'url', data.linker);
		self.sitemap_change('detail', 'name', data.name);

		// Renders view
		self.view(template, data);
	});
}

// ============================================
// ORDERS
// ============================================

// Gets order detail
function view_checkout(linker) {
	var self = this;
	var options = {};

	options.id = linker;

	self.$read(options, function(err, data) {

		if (err || !data)
			return self.throw404();

		// Payment
		// ?pay=1 ---> redirect to PayPal if the order is not paid
		if (self.query.pay === '1' && !data.ispaid) {
			var redirect = F.config.custom.url + self.url + 'paypal/';
			var paypal = PayPal.create(F.config.custom.paypaluser, F.config.custom.paypalpassword, F.config.custom.paypalsignature, redirect, redirect, F.config.custom.paypaldebug);
			paypal.pay(data.id, data.price, F.config.name, F.config.custom.currency, function(err, url) {
				if (err)
					self.throw500(err);
				else
					self.redirect(url);
			});
			return;
		}

		self.view('checkout-detail', data);
	});
}

// Processes PayPal payment
function process_payment_paypal(linker) {
	var self = this;
	var redirect = F.config.custom.url + self.url;
	var paypal = PayPal.create(F.config.custom.paypaluser, F.config.custom.paypalpassword, F.config.custom.paypalsignature, redirect, redirect, F.config.custom.paypaldebug);

	paypal.detail(self, function(err, data, id, price) {

		if (err)
			return self.throw500(err);

		var success = false;

		switch ((data.PAYMENTSTATUS || '').toLowerCase()) {
			case 'pending':
			case 'completed':
			case 'processed':
				success = true;
				break;
		}

		if (success)
			self.$workflow('paid', linker, () => self.redirect('../?success=1'));
		else
			self.view('checkout-error');
	});
}

// ============================================
// ACCOUNT
// ============================================

function view_login() {
	var self = this;
	var user;

	if (self.query.hash)
		user = F.decrypt(self.query.hash);

	if (user && user.expire > Date.now()) {
		MODEL('users').login(self.req, self.res, user.id);
		self.redirect(self.sitemap_url('account') + '?password=1');
		return;
	}

	self.view('account-unlogged');
}

function view_account() {
	var self = this;
	var model = {};
	var options = {};

	options.type = 0;
	options.iduser = self.user.id;
	options.max = 100;

	// Reads all orders
	self.$query(options, self.callback('account'));
}

// Logoff
function redirect_account_logoff() {
	var self = this;
	MODEL('users').logoff(self.req, self.res, self.user);
	self.redirect(self.sitemap_url('account'));
}

// ============================================
// POSTS
// ============================================

function view_blogs() {
	var self = this;
	var options = self.query;
	options.category = 'Blogs';
	self.$query(options, self.callback('blogs-all'));
}

function view_blogs_detail(linker) {
	var self = this;
	var options = {};
	options.category = 'Blogs';
	options.linker = linker;
	self.$read(options, self.callback('blogs-detail'));
}
