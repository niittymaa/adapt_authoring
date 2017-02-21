// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
// NPM includes
var async = require('async');
var prompt = require('prompt');
var exec = require('child_process').exec;
var fs = require('fs-extra');
var optimist = require('optimist');
var path = require('path');
var rimraf = require('rimraf');
var semver = require('semver');
var util = require('util');
// local includes
var auth = require('./lib/auth');
var origin = require('./lib/application');
var database = require('./lib/database');
var frameworkHelper = require('./lib/frameworkhelper');
var helpers = require('./lib/helpers');
var localAuth = require('./plugins/auth/local');
var logger = require('./lib/logger');

// set overrides from command line arguments
prompt.override = optimist.argv;
prompt.start();

prompt.message = '> ';
prompt.delimiter = '';

// get available db drivers and auth plugins
var drivers = database.getAvailableDriversSync();
var auths = auth.getAvailableAuthPluginsSync();
var app = origin();
var masterTenant = false;
var superUser = false;
var configData; // will store config.json contents

var useConfig = function () {
  return optimist.argv.useConfig === true
};

// config items
var configItems = [
  {
    name: 'serverPort',
    type: 'number',
    description: 'Server port',
    required: true,
    pattern: /^[0-9]+\W*$/,
    default: 5000
  },
  {
    name: 'serverName',
    type: 'string',
    description: 'Server name',
    required: true,
    default: 'localhost'
  },
  // {
  //   name: 'dbType',
  //   type: 'string',
  //   description: getDriversPrompt(),
  //   conform: function (v) {
  //     // validate against db drivers
  //     v = parseInt(v, 10);
  //     return  v > 0 && v <= drivers.length;
  //   },
  //   before: function (v) {
  //     // convert's the numeric answer to one of the available drivers
  //     return drivers[(parseInt(v, 10) - 1)];
  //   },
  //   default: '1'
  // },
  {
    name: 'dbHost',
    type: 'string',
    description: 'Database host',
    required: true,
    default: 'localhost'
  },
  {
    name: 'dbName',
    type: 'string',
    description: 'Master database name',
    required: true,
    pattern: /^[A-Za-z0-9_-]+\W*$/,
    default: 'adapt-tenant-master'
  },
  {
    name: 'dbPort',
    type: 'number',
    description: 'Database server port',
    required: true,
    pattern: /^[0-9]+\W*$/,
    default: 27017
  },
  {
    name: 'dbUser',
    type: 'string',
    description: 'Database server username',
    default: ''
  },
  {
    name: 'dbPass',
    type: 'string',
    description: 'Database server password',
    default: ''
  },
  {
    name: 'dataRoot',
    type: 'string',
    description: 'Data directory path',
    required: true,
    pattern: /^[A-Za-z0-9_-]+\W*$/,
    default: 'data'
  },
  {
    name: 'sessionSecret',
    type: 'string',
    description: 'Session secret',
    required: true,
    pattern: /^.+$/,
    default: 'your-session-secret'
  },
  // {
  //   name: 'auth',
  //   type: 'string',
  //   description: getAuthPrompt(),
  //   conform: function (v) {
  //     // validate against auth types
  //     v = parseInt(v, 10);
  //     return  v > 0 && v <= auths.length;
  //   },
  //   before: function (v) {
  //     // convert's the numeric answer to one of the available auth types
  //     return auths[(parseInt(v, 10) - 1)];
  //   },
  //   default: '1'
  // },
  {
    name: 'useffmpeg',
    type: 'string',
    description: "Will ffmpeg be used? y/N",
    required: true,
    before: function (v) {
      if (/(Y|y)[es]*/.test(v)) {
        return true;
      }
      return false;
    },
    default: 'N'
  },
  {
    name: 'smtpService',
    type: 'string',
    description: "Which SMTP service (if any) will be used? (see https://github.com/andris9/nodemailer-wellknown#supported-services for a list of supported services.)",
    default: 'none'
  },
  {
    name: 'smtpUsername',
    type: 'string',
    description: "SMTP username",
    default: ''
  },
  {
    name: 'smtpPassword',
    type: 'string',
    description: "SMTP password",
    hidden: true
  },
  {
    name: 'fromAddress',
    type: 'string',
    description: "Sender email address",
    default: ''
  },
  // {
  //   name: 'outputPlugin',
  //   type: 'string',
  //   description: "Which output plugin will be used?",
  //   default: 'adapt'
  // }
];

var tenantConfig = [
  {
    name: 'tenantName',
    type: 'string',
    description: "Set a unique name for tenant",
    required: true,
    pattern: /^[A-Za-z0-9_-]+\W*$/,
    default: 'master'
  },
  {
    name: 'tenantDisplayName',
    type: 'string',
    description: 'Set tenant display name',
    required: true,
    default: 'Master'
  }
];

var userConfig = [
  {
    name: 'email',
    type: 'string',
    description: "Email address"
  },
  {
    name: 'password',
    type: 'string',
    description: "Password",
    hidden: true
  }
];

/**
 * Installer steps
 *
 * 1. check prerequisites
 * 2. install the framework
 * 3. add config vars
 * 4. configure master tenant
 * 5. create admin account
 * 6. TODO install plugins
 * 7. build frontend
 */
var steps = [
  function checkPrerequisites (next) {
    async.parallel([
      function node(cb) {
        doExec('node --version', function(error, version) {
          var packageJson = fs.readJSON('./package.json', function(error, data) {
            if(error) {
              return cb(error);
            }
            if(!semver.satisfies(version, data.engines.node)) {
              return cb(`Invalid node version installed (${version}). Please use ${data.engines.node}.`);
            }
            cb(null);
          });
        });
      },
      function git(cb) {
        doExec('git --version', cb);
      },
      function mongo(cb) {
        doExec('mongo -version', cb);
      },
      function githubConnect(cb) {
        var server = 'github.com';
        exec(`ping -c 5 ${server}`, function(error, stdout, stderr) {
          if(error || stderr) {
            return cb(`Failed to connect to ${server}`);
          }
          var match = stdout.match(/(\d+) packets transmitted, (\d+) packets received/);
          var sent = match[1];
          var receieved = match[2];
          if(receieved < sent) {
            return cb(`Failed to connect to ${server}`);
          }
          cb(null);
        });
      }
    ], next);

    function doExec(command, cb) {
      exec(command, function(error, stdout, stderr) {
        if(error || stderr) {
          return cb(command.match(/^\S+/)[0] + ' not found. \nPlease install it, or make sure it is configured correctly.');
        }
        if(command.search(/version/) > -1) {
          return cb(null, stdout.match(/\d\d?.\d\d?.\d\d?/)[0]);
        }
        cb(null, stdout);
      });
    }
  },
  function configureEnvironment(next) {
    getConfig(function(err, results) {
      if (err) {
        console.log(`ERROR: ${err}`);
        return exitInstall(1, 'Could not save configuration items.');
      }
      configData = results;
      saveConfig(results, function() {
        console.log("\nChecking configuration, please wait a moment...");
        // suppress app log output
        logger.clear();
        // run the app
        app.run();
        app.on('serverStarted', function(server) {
          next();
        });
      });
    });
  },
  // TODO this only supports MongoDB
  function connectToDb(next) {
    console.log("\nChecking database connection");
    var config = {
      host: app.configuration.getConfig('dbHost'),
      port: app.configuration.getConfig('dbPort'),
      user: app.configuration.getConfig('dbUser'),
      pass: app.configuration.getConfig('dbPass')
    };

    var location = `${config.host}:${config.port}`;
    var options = (config.user && config.pass) ? `--username ${config.user} --password ${config.password}` : '';

    exec('mongo' + options + ' --eval ' + location, function(error, stdout, stderr) {
      if(error || stderr) {
        return next(`Couldn't connect to database at ${location}`);
      }
      next(null, stdout);
    });
  },
  function installFramework (next) {
    // AB-277 always remove framework folder on install
    rimraf(path.resolve(__dirname, 'adapt_framework'), function () {
      // now clone the framework
      frameworkHelper.cloneFramework(function (err) {
        if (err) {
      	  console.log('ERROR: ', err);
          return exitInstall(1, 'Framework install failed. See console output for possible reasons.');
        }
        // Remove the default course
        rimraf(path.resolve(__dirname, 'adapt_framework', 'src', 'course'), function(err) {
          if (err) {
            console.log('ERROR: ', err);
            return exitInstall(1, 'Framework install error -- unable to remove default course.');
          }
          return next();
        });
      });
    });
  },
  function createTenant (next) {
    // delegate functions

    var _configureTenant = function (cb) {
      if (useConfig()) {
        console.log('Creating your tenant. Please wait ...');
        return cb(null, {
          name: configData.tenantName,
          displayName: configData.tenantDisplayName
        });
      }
      console.log('Now create your tenant. Just press ENTER to accept the default value (in brackets). Please wait ...');
      prompt.get(tenantConfig, function (err, result) {
        if (err) {
          console.log('ERROR: ', err);
          return exitInstall(1, 'Tenant creation was unsuccessful. Please check the console output.');
        }
        cb(null, {
          name: result.tenantName,
          displayName: result.tenantDisplayName
        });
      });
    };

    var _createTenant = function (cb) {
      console.log("Creating file system for tenant: " + tenantConfig.name + ", please wait ...");
      app.tenantmanager.createTenant({
          name: tenantConfig.name,
          displayName: tenantConfig.displayName,
          isMaster: true,
          database: {
            dbName: app.configuration.getConfig('dbName'),
            dbHost: app.configuration.getConfig('dbHost'),
            dbUser: app.configuration.getConfig('dbUser'),
            dbPass: app.configuration.getConfig('dbPass'),
            dbPort: app.configuration.getConfig('dbPort')
          }
        },
        function (err, tenant) {
          if (err || !tenant) {
            console.log('ERROR: ', err);
            return exitInstall(1, 'Tenant creation was unsuccessful. Please check the console output.');
          }

          masterTenant = tenant;
          console.log("Tenant " + tenant.name + " was created. Now saving configuration, please wait ...");
          // save master tenant name to config
          app.configuration.setConfig('masterTenantName', tenant.name);
          app.configuration.setConfig('masterTenantID', tenant._id);
          saveConfig(configuration.getConfig(), cb);
        }
      );
    };

    var _deleteCollections = function (cb) {
      async.eachSeries(
        app.db.getModelNames(),
        function (modelName, nxt) {
          app.db.destroy(modelName, null, nxt);
        },
        cb
      );
    };

    // create tenant

    var tenantConfig;

    _configureTenant(function(err, data) {
      if (err) {
        return next(err);
      }
      tenantConfig = data;
      // check if the tenant name already exists
      app.tenantmanager.retrieveTenant({ name: tenantConfig.name }, function (err, tenant) {
        if (err) {
          console.log('ERROR: ', err);
          return exitInstall(1, 'Tenant creation was unsuccessful. Please check the console output.');
        }
        if (tenant) {
          console.log("Tenant already exists. It will be deleted.");
          return prompt.get({ name: "confirm", description: "Continue? (Y/n)", default: "Y" }, function (err, result) {
            if (err || !/(Y|y)[es]*/.test(result.confirm)) {
              return exitInstall(1, 'Exiting install ... ');
            }
            _deleteCollections(function (err) {
              if (err) {
                return next(err);
              }
              return _createTenant(next);
            });
          });
        }
        return _createTenant(next);
      });
    });
  },
  function installContentPlugins (next) {
    // Interrogate the adapt.json file from the adapt_framework folder and install the latest versions of the core plugins
     fs.readFile(path.join(process.cwd(), 'temp', app.configuration.getConfig('masterTenantID').toString(), 'adapt_framework', 'adapt.json'), function (err, data) {
      if (err) {
        console.log('ERROR: ' + err);
        return next(err);
      }

      var json = JSON.parse(data);
      // 'dependencies' contains a key-value pair representing the plugin name and the semver
      var plugins = Object.keys(json.dependencies);

      async.eachSeries(plugins, function(plugin, pluginCallback) {
        if(json.dependencies[plugin] === '*') {
          app.bowermanager.installLatestCompatibleVersion(plugin, pluginCallback);
        } else {
          app.bowermanager.installPlugin(plugin, json.dependencies[plugin], pluginCallback);
        }
      }, next);
    });
  },
  function createSuperUser (next) {
    console.log("Creating the super user account. This account can be used to manage everything on your " + app.polyglot.t('app.productname') + " instance.");
    var errorMsg = 'User account creation was unsuccessful. Please check the console output.';
    prompt.get(userConfig, function (err, result) {
      if (err) {
        console.log('ERROR: ', err);
        return exitInstall(1, errorMsg);
      }
      var userEmail = result.email;
      var userPassword = result.password;
      // ruthlessly remove any existing users (we're already nuclear if we've deleted the existing tenant)
      app.usermanager.deleteUser({ email: userEmail }, function (err, userRec) {
        if (err) {
          console.log('ERROR: ', err);
          return exitInstall(1, errorMsg);
        }
        // add a new user using default auth plugin
        new localAuth().internalRegisterUser({
            email: userEmail,
            password: userPassword,
            _tenantId: masterTenant._id
          }, function (err, user) {
            if (err) {
              console.log('ERROR: ', err);
              return exitInstall(1, errorMsg);
            }
            superUser = user;
            // grant super permissions!
            helpers.grantSuperPermissions(user._id, function (err) {
              if (err) {
                console.log('ERROR: ', err);
                return exitInstall(1, errorMsg);
              }
              return next();
            });
          }
        );
      });
    });
  },
  function gruntBuild (next) {
    console.log('Compiling the ' + app.polyglot.t('app.productname') + ' web application, please wait a moment ... ');
    var proc = exec('grunt build:prod', { stdio: [0, 'pipe', 'pipe'] }, function (err) {
      if (err) {
        console.log('ERROR: ', err);
        console.log('grunt build:prod command failed. Is the grunt-cli module installed? You can install using ' + 'npm install -g grunt grunt-cli');
        console.log('Install will continue. Try running ' + 'grunt build:prod' + ' after installation completes.');
        return next();
      }

      console.log('The ' + app.polyglot.t('app.productname') + ' web application was compiled and is now ready to use.');
      return next();
    });

    // pipe through any output from grunt
    proc.stdout.on('data', console.log);
    proc.stderr.on('data', console.log);
  }
];

// set overrides from command line arguments
prompt.override = optimist.argv;

prompt.start();

// Prompt the user to begin the install
console.log('This script will install the application. Would you like to continue?');

prompt.get({ name: 'install', description: 'Y/n', type: 'string', default: 'Y' }, function (err, result) {
  if (!/(Y|y)[es]*$/.test(result['install'])) {
    return exitInstall();
  }
  // run steps
  async.series(steps, function (err, results) {
    if (err) {
      console.log('ERROR: ', err);
      return exitInstall(1, '\nInstall was unsuccessful. Please check the console output.\n');
    }
    console.log("\nInstallation complete.\n To restart your instance run the command 'node server'.\n");
    exitInstall();
  });
});

// helper functions

function getConfig(next) {
  if (useConfig()) {
    var config = {};
    var configJson = fs.readJSON(path.join('conf', 'config.json'), function(error, data) {
      if(error) {
        return next('config.json not found.');
      }
      console.log('\nNow setting configuration items.');
      var items = configItems.concat(tenantConfig);
      for(var i in items) {
        var item = items[i];
        if(!data.hasOwnProperty(item.name) && item.required) {
          var failed = true;
          if(items[i].hasOwnProperty('default')) {
            var defaultValue = item.default;
            console.log(` - '${item.name}' not found in config.json, using default value (${defaultValue})`)
          } else {
            console.log(` - '${item.name}' not found in config.json and no default value specified.`)
          }
        }
        config[item.name] = data[item.name];
      }
      if(failed) {
        return next('Values missing from config.json. See output for more information.');
      }
      next(null, config);
    });
  } else {
    console.log('Now set configuration items. Just press ENTER to accept the default value (in brackets).');
    prompt.get(configItems, next);
  }
  console.log('');
}

/**
 * This will write out the config items both as a config.json file and
 * as a .env file for foreman
 *
 * @param {object} configItems
 * @param {callback} next
 */

function saveConfig (configItems, next) {
  var env = [];
  Object.keys(configItems).forEach(function (key) {
    env.push(key + "=" + configItems[key]);
  });

  // write the env file!
  if (0 === fs.writeSync(fs.openSync('.env', 'w'), env.join("\n"))) {
    console.log('ERROR: Failed to write .env file. Do you have write permissions for the current directory?');
    process.exit(1, 'Install Failed.');
  }

  // Defaulting these config settings until there are actual options.
  configItems.outputPlugin = 'adapt';
  configItems.dbType = 'mongoose';
  configItems.auth = 'local';

  // write the config.json file!
  if (0 === fs.writeSync(fs.openSync(path.join('conf', 'config.json'), 'w'), JSON.stringify(configItems, null, ' '))) {
    console.log('ERROR: Failed to write conf/config.json file. Do you have write permissions for the directory?');
    process.exit(1, 'Install Failed.');
  }
  return next();
}

/**
 * writes an indexed prompt for available db drivers
 *
 * @return {string}
 */

function getDriversPrompt() {
  var str = "Choose your database driver type (enter a number)\n";
  drivers.forEach(function (d, index) {
    str += (index+1) + ". " + d + "\n";
  });

  return str;
}

/**
 * writes an indexed prompt for available authentication plugins
 *
 * @return {string}
 */

function getAuthPrompt () {
  var str = "Choose your authentication method (enter a number)\n";
  auths.forEach(function (a, index) {
    str += (index+1) + ". " + a + "\n";
  });

  return str;
}

/**
 * Exits the install with some cleanup, should there be an error
 *
 * @param {int} code
 * @param {string} msg
 */

function exitInstall (code, msg) {
  code = code || 0;
  msg = msg || 'Bye!';
  console.log(msg);

  // handle borked tenant, users, in case of a non-zero exit
  if (0 !== code) {
    if (app && app.db) {
      if (masterTenant) {
        return app.db.destroy('tenant', { _id: masterTenant._id }, function (err) {
          if (superUser) {
            return app.db.destroy('user', { _id: superUser._id }, function (err) {
              return process.exit(code);
            });
          }

          return process.exit(code);
        });
      }
    }
  }

  process.exit(code);
}
