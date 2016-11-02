var async = require('async');
var origin = require('./application.js')();
var socket = require('socket.io');
var redis = require('socket.io-redis');

// Privates

var server;
var subscribers = {};
var nextId = 1;

/**
* !! Entry point
*/
origin.on('serverStarted', function init() {
  server = socket(origin._httpServer);
  if(origin.configuration.getConfig('useRedis')) {
    server.adapter(redis({
      host: origin.configuration.getConfig('redisServerName'),
      port: origin.configuration.getConfig('redisServerPort')
    }));
  }
  server.on('connection', onConnection);
});

function addSubscriber(listener, actions) {
  var id = nextId++;
  listener._listenerId = id;
  // add to local store of listeners
  if(typeof listener === 'function') {
    subscribers[id] = {
      fn: listener,
      actions: actions
    };
  }
  return id;
}

function removeSubscriber(id, actions) {
  if(!subscribers[id]) {
    return false;
  }
  if(actions) {
    for(var i = 0, count = actions.length; i < count; i++) {
      var index = subscribers[id].actions.indexOf(actions[i]);
      if(index > -1) subscribers[id].actions.splice(index,1);
    }
  } else {
    delete subscribers[id];
  }
  return true;
}

/**
* Sends messages to all subscribers
* @param {object} data
*/
function notifySubscribers(data) {
  console.log('Socket.notifySubscribers:', data, Object.keys(subscribers).length);
  // notify local listeners
  async.each(subscribers, function(subscriber) {
    var subscribedToaction = !subscriber.actions || subscriber.actions.indexOf(data.action) > -1;
    if(subscribedToaction) subscriber.fn.call(Notify, data);
  });
  // notify remote listeners
  server.emit('data', data);
}

function onConnection(socket) {
  var id = addSubscriber(socket);
  socket.on('message', notifySubscribers);
  socket.on('disconnect', function() {
    removeSubscriber(id);
    Socket.publish('disconnect', { id: id });
  });
  Socket.publish('connect', { id: id });
}

// Public API

module.exports = Socket = {
  /**
  * Add subscriber
  * @param callback function
  * @param list of actions to listen to
  * @return subscriber id (array index)
  */
  subscribe: function(callback, actions) {
    return addSubscriber(callback, actions);
  },
  /**
  * Remove subscriber
  * @param listener id
  * @param list of actions to stop listening to
  * @return success
  */
  unsubscribe: function(id, actions) {
    if(typeof id === 'function') {
      id = id._listenerId;
    }
    return removeSubscriber(id, actions);
  },
  /**
  * Sends data
  * @param data to send
  */
  publish: function(action, data) {
    notifySubscribers({ action: action, data: data });
  },
};
