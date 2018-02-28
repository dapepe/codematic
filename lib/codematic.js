var path     = require('path'),
    fs       = require('fs'),
    schedule = require('node-schedule'), // https://www.npmjs.com/package/node-schedule
    watch    = require('node-watch'); // https://github.com/yuanchuan/node-watch

module.exports = function(options) {
  this.localStore = {};
  this.actions = {};
  this._watcher = [];
  this._schedules = [];

  // Initialize the options
  this._request = typeof options.request == 'object' ? options.request : {};
  this._log = typeof options.log == 'object' ? options.log : {};
  this._onStartup = typeof options.onStartup == 'object' ? options.onStartup : [];
  this._onFilechange = typeof options.onFilechange == 'object' ? options.onFilechange : [];
  this._onSchedule = typeof options.onSchedule == 'object' ? options.onSchedule : [];
  this._onInput = typeof options.onInput == 'object' ? options.onInput : [];
  this._onShutdown = typeof options.onShutdown == 'object' ? options.onShutdown : [];

  // Load the default actions
  this._defaultActions = require(path.join(path.dirname(fs.realpathSync(__filename)), 'actions.js'));

  /**
   * The output/log function, usually overwritten depending on implementation
   *
   * @param {string} message
   */
  this.log = function(message, type) {
    console.log(message);
  }

  /**
   * Perform the startup/shutdown
   */
  var runRuleCurry = function(key, more) {
    return function() {
      if (typeof more == 'function')
        more();

      // Run the startup actions
      var runRules = function() {
        if (this[key].length > 0) {
          var rule = this[key].shift();
          this.runRule(rule, null, runRules);
        }
      }.bind(this);

      runRules();
    }.bind(this);
  }.bind(this);
  this.runStartup = runRuleCurry('_onStartup', function() {
    // Load the default variables
    if (typeof options.params == 'object') {
      Object.keys(options.params).forEach(function(key) {
        this.store(key, options.params[key]);
      }.bind(this));
    }
  }.bind(this));
  this.runShutdown = runRuleCurry('_onShutdown', function() {
    this._watcher.forEach(function(w) {
      w.close();
    });
    this._schedules.forEach(function(s) {
      s.cancel();
    });
  }.bind(this));

  /**
   * Watch for file changes
   */
  this.runFilechange = function() {
    this._onFilechange.forEach(function(rule) {
      this._watcher.push(watch(path.resolve(this.insertVars(rule.filename)), {
        persistent: typeof rule.persistent == 'undefined' ? true: this.insertVars(rule.persistent),
        recursive: typeof rule.recursive == 'undefined' ? false : this.insertVars(rule.recursive),
        encoding: typeof rule.encoding == 'undefined' ? 'utf8' : this.insertVars(rule.encoding),
        filter: typeof rule.filter == 'string' ? new RegExp(this.insertVars(rule.filter)) : null,
        delay: typeof rule.delay == 'undefined' ? 100 : this.insertVars(rule.delay),
      }, function(eventType, name) {
        if (typeof rule.event == 'string' && rule.event != eventType) {
          return;
        }

        this.store(typeof rule['var'] == 'undefined' ? 'FILENAME' : rule['var'], name);

        this.runRule(rule, null, null);
      }.bind(this)));

    }.bind(this));
  }

  /**
   * Run an interval
   */
  this.runSchedule = function() {
    this._onSchedule.forEach(function(rule) {
      if (typeof rule.schedule == 'string') {
        this._schedules.push(schedule.scheduleJob(this.insertVars(rule.schedule), function(execDate) {
          this.store('DATE', execDate.toString());
          this.runRule(rule, null, null);
        }.bind(this)));
      }
    }.bind(this));
  }

  /**
   * Run a barcode and execute a callback
   *
   * @param {string} code
   * @param {function} callback
   */
  this.runInput = function(code, callback) {
    for (var i = 0 ; i < this._onInput.length ; i++) {
      if (this.checkRule(this._onInput[i], code)) {
        if (typeof this._log.file == 'string') {
          fs.appendFile(this._log.file, (new Date()).toLocaleDateString() + ': ' + this._onInput[i].name + ': ' + code, function(err) {
            if (err) {
              this.log('Error writing log file', this._log, err);
            }
          }.bind(this));
        }

        this.runRule(this._onInput[i], code, callback);
        return;
      }
    }

    this.log('No rule found for code ', code);

    if (typeof callback == 'function') {
      callback();
    }
  }

  /**
   * Check if a rule is valid
   *
   * @param {object} rule
   * @param {string} code
   * @param {function} callback
   * @return {boolean}
   */
  this.checkRule = function(rule, code, callback) {
    if (typeof rule != 'object') {
      throw 'Rule is not an object';
    }

    if (typeof rule.input == 'undefined') {
      throw 'Rule is missing input definition';
    }

    if (typeof rule.action != 'object') {
      throw 'Rule has no action';
    }

    if (typeof code != 'string' || !code.match(new RegExp(rule.input))) {
      return false;
    }

    return true;
  }

  /**
   * Execute a rule and store the current barcode in the CODE variable
   *
   * @param {object} rule
   * @param {string} code
   * @param {function} callback
   */
  this.runRule = function(rule, code, callback) {
    this.localStore.CODE = code;
    return this.runAction(rule.action, callback);
  }

  /**
   * Executes an action and resolves the action chain
   *
   * @param {object} action
   * @param {function} callback
   */
  this.runAction = function(action, callback) {
    if (!this.hasAction(action.type)) {
      throw 'Unknown rule: ' + action.type;
    }

    this.actions[action.type].call(this, action, function(key, action) {
      switch (key) {
        case 'success':
          key = 'then';
        case 'error':
        default:
          if (typeof action[key] == 'object') {
            return this.runAction(action[key], callback);
          }
      }

      if (typeof callback == 'function') {
        return callback();
      }
    }.bind(this));
  }

  /**
   * Register a new action. If no callback is specified, a default action with the same action name will be used
   *
   * @param {string} action
   * @param {function} callback
   */
  this.registerAction = function(action, callback) {
    if (typeof callback == 'function') {
      this.actions[action] = callback;
      return;
    }

    if (typeof this._defaultActions[action] == 'function') {
      this.actions[action] = this._defaultActions[action].bind(this);
    }
  }

  /**
   * Register all default actions
   */
  this.registerDefaultActions = function() {
    this.registerActions(this._defaultActions);
  }

  /**
   * Register multiple actions
   *
   * @param {object} actions
   */
  this.registerActions = function(actions) {
    for (var action in actions) {
      if (actions.hasOwnProperty(action)) {
        this.registerAction(action, actions[action].bind(this));
      }
    }
  }

  /**
   * Check if an action exists
   *
   * @param {string} action
   * @return {boolean}
   */
  this.hasAction = function(action) {
    return typeof this.actions[action] == 'function';
  }

  /**
   * Insert placeholders into a string
   *
   * @param {string} subject
   * @return {string}
   */
  this.insertVars = function(subject) {
    if (typeof subject == 'string') {
      Object.keys(this.localStore).forEach(function(key) {
        if ((typeof this.localStore[key] == 'string') || (typeof this.localStore[key] == 'number')) {
          subject = subject.replace('%' + key + '%', this.localStore[key]);
        }
      }.bind(this));
    }

    return subject;
  }

  /**
   * Push a list value
   *
   * @param {string} key
   * @param {string} value
   */
  this.push = function(key, value) {
    if ((typeof this.localStore[key] == 'object')) {
      this.localStore[key].push(value);
    }
  }

  /**
   * Push a new value
   *
   * @param {string} key
   * @param {string} value
   */
  this.store = function(key, value) {
    if ((typeof value == 'string') || (typeof value == 'number')) {
      this.localStore[key] = value;
    }
  }

  /**
   * Retrieve from local store
   *
   * @param {string} key
   */
  this.get = function(key) {
    return typeof this.localStore[key] == 'undefined' ? null : this.localStore[key];
  }

  /**
   * Clear the entire store or a single slot
   *
   * @param {string} key
   */
  this.clear = function(key) {
    if (typeof key == 'undefined' || key == null) {
      this.localStore = {};
    } else if (typeof this.localStore[key] != 'undefined') {
      delete this.localStore[key];
    }
  }

  /**
   * Return the current barcode
   *
   * @return {string}
   */
  this.getCode = function() {
    return typeof this.localStore.CODE == 'undefined' ? '' : this.localStore.CODE;
  }
}
