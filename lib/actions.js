var querystring = require('querystring'),
    request     = require('request'),
    path        = require('path'),
    fs          = require('fs'),
    beep        = require('beepbeep'),
    read        = require('read'),
    exec        = require('child_process').exec;

module.exports = {
  'beep': function(action, callback) {
    var count = typeof action.count == 'undefined' ? 1 : action.count,
        delay = action.delay == 'undefined' ? null : action.delay;

    // console.log('Beep: ' + count);

    beep(count, delay);

    callback('success', action);
  },

  'store': function(action, callback) {
    if (typeof action['var'] != 'string') {
      throw 'Missing variable name';
    }

    var value = typeof action.value == 'undefined' ? this.getCode() : this.insertVars(action.value);

    console.log('Store: ' + action['var'] + ' = ' + value);

    this.store(action['var'], value);

    callback('success', action);
  },

  'output': function(action, callback) {
    if (typeof action.data != 'string') {
      throw 'Missing output data';
    }

    this.log(this.insertVars(action.data), this.insertVars(action.style));

    callback('success', action);
  },

  'writefile': function(action, callback) {
    if (typeof action.filename != 'string') {
      throw 'Missing filename';
    }

    var filename = path.resolve(this.insertVars(action.filename));

    var func = 'writeFile';
    if (typeof action.mode == 'string' && action.mode.toLowerCase() == 'append') {
      func = 'appendFile';
    }

    var data = null;
    if (typeof action.data != 'undefined') {
      data = this.insertVars(action.data);
    } else if (typeof action.var_source != 'undefined') {
      data = this.get(action.var_source);
    }

    if (data == null) {
      throw 'Missing content';
    }

    fs[func](filename, data, function(err) {
      if (err) {
        this.store('ERROR', err);
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

    fs.readFile(filename, typeof action['encoding'] == 'undefined' ? 'utf8' : action['encoding'], function(err, data) {
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

  'replace': function(action, callback) {
    if (typeof action.subject != 'string') {
      throw 'No subject defined for replacement';
    }
    if (typeof action.pattern != 'string') {
      throw 'No pattern defined for replacement';
    }
    if (typeof action.replacement != 'string') {
      action.replacement = '';
    }
    if (typeof action['var'] == 'undefined') {
      throw 'No variable name for replacement';
    }

    var subject = this.insertVars(action.subject),
        pattern = this.insertVars(action.pattern),
        replacement = this.insertVars(action.replacement);

    this.store(action['var'], subject.replace(new RegExp(pattern), replacement));

    callback('success', action);
  },

  'request': function(action, callback) {
    var url;

    if (typeof action.url != 'string') {
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

    var includePlaceholders = function(data) {
      Object.keys(data).forEach(function(key) {
        if (typeof data[key] == 'string') {
          data[key] = this.insertVars(data[key]);
        } else if (typeof data[key] == 'object') {
          data[key] = includePlaceholders(data[key]);
        }
      }.bind(this));

      return data;
    }.bind(this);

    var data = {};
    if (typeof action.data == 'object') {
      data = includePlaceholders(JSON.parse(JSON.stringify(action.data)));
    }

    switch (callparams.method) {
      case 'GET':
      case 'DELETE':
        var params = querystring.stringify(data);
        if (params != '')
          callparams.uri += '?' + params;
        break;
      case 'POST':
      case 'PUT':
        callparams.form = data;
        break;
    }

    // Perform the HTTP request
    var r = request(callparams, function(err, response, body) {
      this.store(typeof action['var'] == 'undefined' && action['var'] != '' ? 'BODY' : action['var'], body);
      if (err) {
        this.store('ERROR', '' + err);
        callback('500', action);
        return;
      }

      for (var key in response) {
        if (response.hasOwnProperty(key)) {
          this.store('RESPONSE_' + key, response[key]);
        }
      }

      if (response.statusCode != null) {
        callback(response.statusCode, action);
      }
    }.bind(this));
    if (typeof action.filename != 'undefined') {
      var filename = path.resolve(this.insertVars(action.filename));
      r.pipe(fs.createWriteStream(filename));
    }
  }
}
