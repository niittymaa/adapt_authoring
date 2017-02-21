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

function addSubscriber(subscriber) {
  var id = nextId++;
  subscriber._listenerId = id;
  subscribers[id] = subscriber;
  console.log('Socket.addSubscriber:', Object.keys(subscribers));
  return id;
}

function removeSubscriber(id) {
  if(!subscribers[id]) {
    return false;
  }
  delete subscribers[id];
  console.log('Notify.removeSubscriber:', id, Object.keys(subscribers));
  // just to make sure the IDs don't get carried away...
  if(Object.keys(subscribers).length === 0) {
    nextId = 1;
  }
  return true;
}

function notifySubscribers(data) {
  async.each(subscribers, function(subscriber) {
    if(subscriber.emit) {
      subscriber.broadcast.emit('data', JSON.stringify(data));
    } else {
      subscriber.call(Notify, data);
    }
  });
}

function onConnection(socket) {
  var id = addSubscriber(socket);
  socket.on('message', notifySubscribers);
  socket.on('disconnect', function() {
    removeSubscriber(id);
  });
}

// Public API

module.exports = Socket = {
  /**
  * Sends dataa
  */
  publish: function(data) {
    notifySubscribers(data);
  },

  /**
  * Add subscriber
  * @param callback function
  * @return subscriber id (array index)
  */
  subscribe: function(callback) {
    return addSubscriber(callback);
  },

  /**
  * Remove subscriber
  * @param listener id
  * @return success
  */
  unsubscribe: function(id) {
    if(typeof id === 'function') {
      id = id._listenerId;
    }
    return removeSubscriber(id);
  }
};
