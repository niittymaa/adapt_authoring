/**
 * Exposes the log
 **/
var _ = require('underscore');
var fs = require('fs');
var configuration = require('../../lib/configuration');
var logger = require('../../lib/logger');
var path = require('path');
var server = module.exports = require('express')();
var winston = require('winston');

var LOG_PATH = path.join(configuration.serverRoot, 'log.json');

function initialise() {
  logger.add(winston.transports.File, {
    filename: LOG_PATH
  });
};

server.get('/log', function (req, res, next) {
  fs.readFile(LOG_PATH, 'utf8', function(error, data) {
    if(error) return res.status(500).json(error.toString());

    var logs = data.split('\n');
    var data = {
      logs: []
    }
    _.each(logs, function(item, index) {
      if(!_.isEmpty(item)) {
        var logObj = JSON.parse(item);
        logObj.message = logObj.message.replace(/\[.+\]\s/, ''),
        data.logs.push(logObj);
      }
    });
    return res.json(data);
  });
});

initialise();
