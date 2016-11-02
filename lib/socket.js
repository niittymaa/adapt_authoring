var async = require('async');
var origin = require('./application.js')();
var socket = require('socket.io');

// Privates

var server;
var subscribers = {};
var nextId = 1;

/**
* !! Entry point
*/
origin.on('serverStarted', function init() {
  server = socket(origin._httpServer);
  server.on('connection', onConnection);
});

function addSubscriber(callback, actions) {
  var id = nextId++;
  callback._listenerId = id;
  subscribers[id] = {
    fn: callback,
    actions: actions
  };
  return id;
}

function removeSubscriber(id, actions) {
  if(!subscribers[id]) {
    return false;
  }
  if(actions) {
    for(var i = 0, count = actions.length; i < count; i++) {
      var i = subscribers[id].actions.indexOf(actions[i]);
      if(i > -1) subscribers[id].actions.splice(i,1);
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
  console.log('Socket.notifySubscribers:', JSON.stringify(data), Object.keys(subscribers).length);
  async.each(subscribers, function(subscriber) {
    if(!subscriber.actions || subscriber.actions.indexOf(data.action) > -1) {
      // subscriber is function or socket
      if(subscriber.fn.broadcast) {
        subscriber.fn.broadcast.emit('data', JSON.stringify(data));
      } else {
        subscriber.fn.call(Notify, data);
      }
    }
  });
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
