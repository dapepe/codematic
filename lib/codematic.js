var path        = require('path'),
    fs          = require('fs');

module.exports = function(options) {
  this.localStore = {};
  this.actions = {};

  // Initialize the options
  this._request = typeof options.request == 'object' ? options.request : {};
  this._rules = typeof options.rules == 'object' ? options.rules : {};
  this._log = typeof options.log == 'object' ? options.log : {};

  // Load the default actions
  this._defaultActions = require(path.join(path.dirname(fs.realpathSync(__filename)), 'actions.js'));

  /**
   * The output/log function, usually overwritten depending on implementation
   *
   * @param {string} message
   */
  this.log = function(message) {
    console.log(message);
  }

  /**
   * Run a barcode and execute a callback
   *
   * @param {string} code
   * @param {function} callback
   */
  this.run = function(code, callback) {
    for (var i = 0 ; i < this._rules.length ; i++) {
      if (this.checkRule(this._rules[i], code)) {
        if (typeof this._log.file == 'string') {
          fs.appendFile(this._log.file, (new Date()).toLocaleDateString() + ': ' + this._rules[i].name + ': ' + code, function(err) {
            if (err) {
              this.log('Error writing log file', this._log, err);
            }
          }.bind(this));
        }
        this.runRule(this._rules[i], code, callback);
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
      throw 'Rule has not action';
    }

    if (!code.match(new RegExp(rule.input))) {
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
          if (typeof action[key] == 'object') {
            return this.runAction(action[key], callback);
          }
      }

      return callback();
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
    Object.keys(this.localStore).forEach(function(key) {
      if ((typeof this.localStore[key] == 'string') || (typeof this.localStore[key] == 'number')) {
        subject = subject.replace('%' + key + '%', this.localStore[key]);
      }
    }.bind(this));

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
