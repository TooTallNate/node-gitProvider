require('http').createServer(
  require('../')(__dirname + '/..')
).listen(3000);
