// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(['require', 'coreJS/app/origin', 'underscore', '//localhost:5000/socket.io/socket.io.js'], function(require, Origin, _, io) {
	// Privates
	var connection;
	var subscribers = {};
	var nextId = 1;

	function init() {
		Origin.on('app:dataReady', connect);
		Origin.Notify.register('socket', Socket);
	}

	function connect() {
		connection = io();

		connection.on('connect', onConnect);
		connection.on('connect_error', onError);
		connection.on('reconnect', onReconnect);
		connection.on('reconnect_error', onError);
		connection.on('reconnect_failed', onError);
		connection.on('disconnect', onDisconnect);

		connection.on('data', onData);
		connection.on('error', onError);
	}

	function notifySubscribers(data) {
		console.log('Socket.notifySubscribers:', '[' + data.action + ']', data.data);
		for(var key in subscribers) {
			var subscriber = subscribers[key];
			if(!subscriber.actions || _.indexOf(subscriber.actions, data.action) > -1) {
				subscriber.fn.call(Socket, data);
			}
		}
	}

	/**
	* Events
	*/

	function onConnect() { }
	function onReconnect(attemptNo) { }
	function onDisconnect() { }

	function onData(data) {
		notifySubscribers(data);
	}

	function onError(error) {
		console.log('Error:', error);
	}

	// public API

	var Socket = {
		/**
		* Adds a listener
		* @param {Function} callback
		* @param {Array} actions to listen to
		*/
		subscribe: function(actions, callback) {
			if(typeof actions === 'function') {
				callback = actions;
				actions = null;
			}
			var id = nextId++;
		  callback._listenerId = id;
		  subscribers[id] = {
				fn: callback,
				actions: actions
			};
		  return id;
		},
		/**
		* Removes a listener or stops listening to specific actions
		* @param  {String} listener ID
		* @param {Array} actions to stop listening to
		*/
		unsubscribe: function(id, actions) {
			if(!subscribers[id]) {
				return false;
			}
			if(actions) {
				for(var i = 0, count = actions.length; i < count; i++) {
					var i = _.indexOf(subscribers[id].actions, actions[i]);
					if(i > -1) subscribers[id].actions.splice(i,1);
				}
			} else {
				delete subscribers[id];
				// just to make sure the IDs don't get carried away...
				if(Object.keys(subscribers).length === 0) {
					nextId = 1;
				}
			}
			return true;
		},
		/**
		* Sends a message across the socket
		* @param {String} action
		* @param {Object} data
		*/
		publish: function(action, data) {
			if(!this.isConnectionOpen()) return false;
			connection.emit('message', { action: action, data: data });
		},

		isConnectionOpen: function() {
			return connection && connection.connected;
		}
	};

	return init;
});
