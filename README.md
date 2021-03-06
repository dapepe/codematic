Codematic
=========

[![NPM](https://nodei.co/npm/codematic.png)](https://nodei.co/npm/codematic/)


Purpose
-------

Codematic is a tools that enables process automation by using barcodes or
QR codes - or any type of code that can be entered through a scanning device.


Installation
------------

Simply install via NPM:

```
npm install codematic
```

Usage
-----

```javascript
var options = {
  onInput: [
    {
      name: 'Test',
      input: '^X[0-9]+',
      action: {
        type: 'output',
        data: 'Sending code %CODE% to URL',
        then: {
          type: 'request',
          route: '/%CODE%',
          method: 'GET',
          200: {
            type: 'output',
            data: 'Success! Server response: %RESPONSE%'
            then: {
              type: 'myaction'
            }
          },
          500: {
            type: 'output',
            data: 'Ooops! Something went wrong here!'
          }
        }
      }
    }
  ],
  request: {
    url: 'http://testurl/'
  },
  log: {
    file: '/var/log/codematic.log'
  }
}

var codematic = new Codematic(options);

codematic.log = function(message) {
  // By overwriting the log function you can specify where you want to put your console output
  // Default is "console.log"
  console.log(message);
}

// Register the default actions (see documentation)
codematic.registerDefaultActions();

// Register a custom action
codematic.registerAction('myaction', function(action, callback) {
  this.log('This is a custom action');
  // If the callback is successful, the next "then" action will be called
  callback('success', action);

  // If something goes wrong, use the "error" callback to trigger the "error" action
  callback('error', action);
});

var code = 'X23434';

codematic.run(code, function() {
  console.log('Complete');
});
```


Options
-------

### Rules

As you can see in the example, it is very easy to define new rules. A rule consists of
the following parameters:

* A `name` to describe the rule
* An `input` definition, which represents a regular expression that matches the expected code
* An `action` sequence that will be executed when the code is entered

As you can see, an action sequence is chained through `then` and `error` callbacks.
You can pass on parameters and substitute variables within strings.

Also, it is very easy to define your own action using the `registerAction` method.

Codematic ships with a set of default actions, documented below.


### Log Setting

Defines the log settings. If `log.file` is set, all processed codes will be written
to the specified log file including the date/time.


### Request Settings

In order to make it easy to work with REST services, you can easily define a base URL
as well as a standard username and password.


Events
------

### onInput

Actions are executed on String input (e.g. when a barcode is scanned)

Parameters:

* `input`: `RegExp` Regular expression to match against the input string


### onFilechange

Watch files for changes

Parameters:

* `persistent`: `Boolean` Indicates whether the process should continue to run as long as files are being watched. (default = `true`)
* `recursive`: `Boolean` Indicates whether all subdirectories should be watched, or only the current directory. (default = `false`)
* `encoding`: `String` File encoding (default = `utf8`)
* `filter`: `RegExp` Return that matches the filter expression.
* `delay`: `Number`, in ms Delay time of the callback function. (default = `100`)
* `event`: `String` Event type (`update`, `remove`, default = `both`)


### onSchudule

Run actions in a specific interval

Parameters:

* `schedule`: `String` Cron-like schedule syntax, see https://www.npmjs.com/package/node-schedule

```
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    │
│    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
│    │    │    │    └───── month (0 - 11)
│    │    │    └────────── day of month (1 - 31)
│    │    └─────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59, OPTIONAL)
```

Default Actions
---------------

### beep

Emits a "noise" through the default system speaker

Parameters:

* `count`: Number of beeps (default: 1)
* `delay`: Delay between beeps


### store

Stores a value in a variable

Parameters:

* `var`: Variable name
* `value`: Variable value (default is the last code that has been scanned)


### output

Writes a string to the console using the `log` method.

Parameters:

* `data`: Output data
* `style`: Output style (e.g. "danger", "success", "info")


### writefile

Writes a file

Parameters:

* `filename`: The filename
* `mode`: "append" or "write" (default is "write")
* `data`: The file data
* `var_source`: Instead of using data, you can also specify a source variable


### readfile

Reads a file and stores it to the local store

Parameters:

* `filename`: The filename
* `var`: Variable name (default is `FILE`)
* `encoding`: File encoding (default is `utf8`)


### clear

Clears a single slot or - if no variable is defined - all variable slots

Parameters:

* `var`: Variable name


### replace

Replace a string value

Parameters:

* `subject`
* `pattern`: Regular expression
* `replacement`: Replacement value (default: "")
* `var`: Variable name


### exec

Executes an external program and stores the output to a variable

Parameters:

* `command`: Command path
* `var`: Variable name


### request

Performs an HTTP request

Parameters:

* `url`: The request URL
* `route`: If you have configured a global base URL in the Codematic options, you can also define a single route instead of a full URL
* `method`: GET, POST, PUT, DELETE (default is GET)
* `data`: The form data object. Placeholders will be included for string values
* `var`: The variable name for the response value (default is `BODY`)
* `filename`: Optional sends response to a filename (e.g. for PDF documents)
* `decode_json`: Decodes the request body

There's also a special behavior for command chaining, since you can also use the response code to issue follow up commands (see sample config)


Sample Configuration
--------------------

```yaml
---
  ---
  request:
    url: https://cloud.zeyos.com/pepe/remotecall/barcodeapi
    username: ''
    password: ''
  log:
    error: log/error.log
    default: log/default.log
  onInput:
  - name: Test Request
    input: "^X[0-9]+"
    action:
      type: request
      route: "/"
      200:
        type: beep
        count: 5
        delay: 10
        then:
          type: output
          data: Value stored %testvar%
      500:
        type: output
        style: danger
        data: Request failed %BODY%
  - name: Store the barcode
    input: "^A[0-9]+"
    action:
      type: store
      var: testvar
      then:
        type: beep
        count: 5
        delay: 10
        then:
          type: output
          data: Value stored %testvar%
  - name: Scan new barcode for request
    input: "^R[0-9]+"
    action:
      type: writefile
      filename: test.txt
      mode: append
      data: Hallo %testvar%
      then:
        type: output
        data: File written
  - name: Check the wildcard
    input: ".*"
    action:
      type: store
      var: testvar
      then:
        type: output
        data: Value stored %testvar%
        then:
            type: request
            method: GET
            var: resp
            route: /%testvar%
            then:
              type: output
              data: Server response %resp%
```
