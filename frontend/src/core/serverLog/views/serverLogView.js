// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var Backbone = require('backbone');
  var Handlebars = require('handlebars');
  var OriginView = require('coreJS/app/views/originView');
  var Origin = require('coreJS/app/origin');

  var ServerLogView = OriginView.extend({
    tagName: 'div',
    className: 'serverLog',

    postRender: function() {
      this.setViewToReady();
    }
  }, {
    template: 'serverLog'
  });

  return ServerLogView;
});
