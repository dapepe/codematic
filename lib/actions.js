var querystring = require('querystring'),
    request     = require('request'),
    path        = require('path'),
    fs          = require('fs'),
    Table       = require('cli-table'),
    beep        = require('beepbeep'),
    read        = require('read'),
    exec        = require('child_process').exec;

module.exports = {
  'beep': function(action, callback) {
    var count = typeof action.count == 'undefined' ? 1 : action.count,
        delay = action.delay == 'undefined' ? null : action.delay;

    this.log('Beep: ' + count);

    beep(count, delay);

    callback('success', action);
  },

  'store': function(action, callback) {
    if (typeof action['var'] != 'string') {
      throw 'Missing variable name';
    }

    var value = typeof action.value == 'undefined' ? this.getCode() : this.insertVars(action.value);

    this.log('Store: ' + action['var'] + ' = ' + value);

    this.store(action['var'], value);

    callback('success', action);
  },

  'output': function(action, callback) {
    if (typeof action.data != 'string') {
      throw 'Missing output data';
    }

    this.log(this.insertVars(action.data));

    callback('success', action);
  },

  'writefile': function(action, callback) {
    if (typeof action.filename != 'string') {
      throw 'Missing filename';
    }
    if (typeof action.data != 'string') {
      throw 'Missing content';
    }

    var filename = this.insertVars(action.filename);

    var func = 'writeFile';
    if (typeof action.mode == 'string' && action.mode.toLowerCase() == 'append') {
      func = 'appendFile';
    }

    fs[func](filename, this.insertVars(action.data), function(err) {
      if (err) {
        callback('error', action);
        return;
      }

      callback('success', action);
    }.bind(this));
  },

  'readfile': function(action, callback) {
    if (typeof action.filename != 'string') {
      throw 'Missing filename';
    }

    var filename = this.insertVars(action.filename);

    fs.readFile(filename, function(err, data) {
      if (err) {
        callback('error', action);
        return;
      }

      this.store(typeof action['var'] == 'undefined' ? 'FILE' : action['var'], data);

      callback('success', action);
    }.bind(this));
  },

  /**
   * Clear variables form the register
   *
   */
  'clear': function(action, callback) {
    this.clear(typeof action['var'] == 'undefined' ? null : action['var']);
  },

  'exec': function(action, callback) {
    exec(this.insertVars(action.command), function(err, stdout, stderr) {
      if (err || stderr) {
        action.error = err;
        callback('error', action);
        return;
      }

      this.store(typeof action['var'] == 'undefined' && action['var'] != '' ? 'RESPONSE' : action['var'], stdout);

      callback('success', action);
    });
  },

  'request': function(action, callback) {
    var url;    if (typeof action.url != 'string') {
      if (typeof action.route != 'string' || typeof this._request.url != 'string' || this._request.url == '') {
        throw 'Missing request URL';
      } else {
        if (this._request.url.substring(this._request.url.length - 1, this._request.url.length) != '/') {
          this._request.url = this._request.url + '/';
        }
        if (action.route.substring(0, 1) == '/')  {
          action.route = action.route.substring(1, action.route.length);
        }

        url = this._request.url + action.route;
      }
    } else {
      url = action.url;
    }

    action.method = ((typeof action.method == 'undefined' || action.method == null) ? 'GET' : action.method).toUpperCase();
    switch (action.method) {
      case 'POST':
      case 'PUT':
      case 'DELETE':
        break;
      default:
        action.method = 'GET';
    }

    var callparams = {
      'uri':    this.insertVars(url),
      'method': action.method
    };

    var options;

    switch (callparams.method) {
      case 'GET':
      case 'DELETE':
        var params = querystring.stringify(options);
        if (params != '')
          callparams.uri += '?' + params;
        break;
      case 'POST':
      case 'PUT':
        callparams.form = options;
        break;
    }

    // Perform the HTTP request
    request(callparams, function(err, response, body) {
      if (err) {
        action.error = err;
        callback('error', action);
        return;
      }

      this.store(typeof action['var'] == 'undefined' && action['var'] != '' ? 'RESPONSE' : action['var'], body);

      callback('success', action);
    }.bind(this));
  }
}
