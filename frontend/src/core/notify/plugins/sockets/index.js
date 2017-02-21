// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(['require', '//localhost:5000/socket.io/socket.io.js'], function(require, io) {
	var Origin = require('coreJS/app/origin');

	// Privates

	var connection;
	var subscribers = {};
	var nextId = 1;

	function init() {
		Origin.on('app:dataReady', connect);
		Origin.Notify.register('socket', Socket);
	};

	function connect() {
		connection = io();

		connection.on('connect', onConnect);
		connection.on('connect_error', onConnectError);
		connection.on('reconnect', onReconnect);
		connection.on('reconnect_error', onReconnectError);
		connection.on('reconnect_failed', onReconnectFailed);
		connection.on('disconnect', onDisconnect);

		connection.on('data', onData);
		connection.on('error', onError);
	};

	function notifySubscribers(data) {
		console.log('notifySubscribers:', data);
		for(var key in subscribers) {
	    subscribers[key].apply(Socket, data);
		}
	};

	/**
	* Events
	*/

	function onConnect() { };
	function onReconnect(attemptNo) { };
	function onDisconnect() { };

	function onData(data) {
		notifySubscribers(JSON.parse(data));
	};

	// Event errors

	function onConnectError(error) { };
	function onReconnectError(error) { };
	function onReconnectFailed(error) { };
	function onError(error) { };

	// public API

	var Socket = {
		subscribe: function(callback) {
			if(!this.isConnectionOpen()) return false;
			var id = nextId++;
		  callback._listenerId = id;
		  subscribers[id] = callback;
		  return id;
		},
		unsubscribe: function(id) {
			if(!this.isConnectionOpen() || !subscribers[id]) return false;
		  delete subscribers[id];
		  // just to make sure the IDs don't get carried away...
		  if(Object.keys(subscribers).length === 0) {
		    nextId = 1;
		  }
		  return true;
		},
		publish: function(data, options) {
			console.log('publish', data);
			if(!this.isConnectionOpen()) return false;
			connection.emit('message', JSON.stringify(data));
		},
		isConnectionOpen: function() {
			return connection.connected;
		}
	};

	return init;
});
